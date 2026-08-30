"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { getSuperuserClient } from "@/lib/pb/superuser";
import { generateInviteCode, isPlausibleInviteCode, normalizeInviteCode } from "./invite-code";
import { ensureCommissionerMembership } from "./repair";
import { canAcceptMember, parseLeagueSettings, leagueSettingsSchema } from "./settings";
import type { LeagueRecord, MemberRecord } from "./types";

/**
 * League writes. Every one runs as the superuser over localhost; the client only
 * ever requests them.
 *
 * PocketBase has no transactions, so the two-write path in `createLeague` is
 * ordered deliberately and has a named repair — see the comment there and
 * docs/adr/ADR-0003.
 */

const createLeagueSchema = z.object({
  name: z.string().trim().min(2, "Give the league a name of at least 2 characters.").max(60),
  season: z.string().trim().min(4).max(16).default("2026-27"),
});

/** How many times to retry a colliding invite code before giving up. */
const INVITE_CODE_ATTEMPTS = 5;

function fail(path: string, reason: string): never {
  redirect(`${path}?error=${encodeURIComponent(reason)}`);
}

export async function createLeague(formData: FormData): Promise<never> {
  const session = await requireSession();

  const parsed = createLeagueSchema.safeParse({
    name: formData.get("name"),
    season: formData.get("season") || undefined,
  });
  if (!parsed.success) {
    fail("/", parsed.error.issues[0]?.message ?? "That league name will not do.");
  }

  const pb = await getSuperuserClient();

  // Retry on a colliding invite code. The space is ~594 million, so this
  // effectively never loops — but the unique index is authoritative, and code
  // that assumes a random string is unique is code that eventually corrupts.
  let league: LeagueRecord | undefined;
  for (let attempt = 0; attempt < INVITE_CODE_ATTEMPTS; attempt += 1) {
    try {
      // ── Write 1 of 2 ─────────────────────────────────────────────────────
      league = await pb.collection("leagues").create<LeagueRecord>(
        {
          name: parsed.data.name,
          season: parsed.data.season,
          commissioner: session.user.id,
          invite_code: generateInviteCode(),
          settings: leagueSettingsSchema.parse({}),
          status: "setup",
        },
        { requestKey: null },
      );
      break;
    } catch (error) {
      const isLastAttempt = attempt === INVITE_CODE_ATTEMPTS - 1;
      if (isLastAttempt) {
        console.error("[leagues] could not create league", error);
        fail("/", "Could not create the league. Try again.");
      }
    }
  }
  if (!league) fail("/", "Could not create the league. Try again.");

  // ── Write 2 of 2 ───────────────────────────────────────────────────────────
  // The commissioner drafts too, so they are a member of their own league.
  //
  // Failure recovery: if this write is lost, the league exists with no members.
  // That state is detectable and self-healing rather than corrupt — the league's
  // read rule admits its commissioner regardless of membership, so they still
  // see it, and opening its lobby calls `ensureCommissionerMembership`. Deleting
  // the league here would be the worse choice: it can itself fail, and it
  // discards a valid record over a retryable write.
  await ensureCommissionerMembership(league.id);

  redirect(`/leagues/${league.id}`);
}

export async function joinLeague(formData: FormData): Promise<never> {
  const session = await requireSession();

  const raw = String(formData.get("code") ?? "");
  const code = normalizeInviteCode(raw);
  const echo = `&code=${encodeURIComponent(raw.slice(0, 32))}`;

  if (!isPlausibleInviteCode(code)) {
    redirect(`/?error=${encodeURIComponent("That is not a valid invite code.")}${echo}`);
  }

  const pb = await getSuperuserClient();

  // Looked up as the superuser, not as the user: a would-be member cannot yet
  // read the league, because they are not in it. This is the one read in the
  // app that deliberately bypasses the rules, and it is why the lookup is by
  // exact code only — never a listing.
  let league: LeagueRecord | undefined;
  try {
    league = await pb
      .collection("leagues")
      .getFirstListItem<LeagueRecord>(`invite_code = '${code}'`, {
        requestKey: null,
      });
  } catch {
    redirect(`/?error=${encodeURIComponent("No league has that invite code.")}${echo}`);
  }

  const members = await pb.collection("league_members").getFullList<MemberRecord>({
    filter: `league = '${league.id}'`,
    requestKey: null,
  });

  // Already in? Joining again is not an error, it is a no-op with a redirect.
  if (members.some((m) => m.user === session.user.id)) {
    redirect(`/leagues/${league.id}`);
  }

  const verdict = canAcceptMember(
    parseLeagueSettings(league.settings),
    members.length,
    league.status,
  );
  if (!verdict.ok) {
    redirect(`/?error=${encodeURIComponent(verdict.reason)}${echo}`);
  }

  try {
    // Single write. Two people racing the last slot both pass the check above;
    // `unique(league, user)` stops the same person joining twice, and the
    // capacity check is re-run on the next page load, so the cap cannot be
    // exceeded silently for long.
    await pb.collection("league_members").create(
      {
        league: league.id,
        user: session.user.id,
        team_name: session.user.name || "",
        autodraft_enabled: false,
      },
      { requestKey: null },
    );
  } catch {
    // The index refused it: either a double submit, or a genuine race. Either
    // way the user's place is already taken care of or the league is unchanged.
    redirect(`/leagues/${league.id}`);
  }

  redirect(`/leagues/${league.id}`);
}
