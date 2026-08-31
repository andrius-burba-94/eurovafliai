"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireSession } from "@/lib/auth/session";
import { getSuperuserClient } from "@/lib/pb/superuser";
import { generateInviteCode, isPlausibleInviteCode, normalizeInviteCode } from "./invite-code";
import {
  canKickMember,
  canMarkReady,
  canRenameTeam,
  validateTeamName,
  type LobbyActor,
} from "./lobby";
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

  redirect(`/leagues/${league.id}?arrived=1`);
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
    redirect(`/leagues/${league.id}?arrived=1`);
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
    redirect(`/leagues/${league.id}?arrived=1`);
  }

  redirect(`/leagues/${league.id}?arrived=1`);
}

// ── The lobby's three controls ──────────────────────────────────────────────
//
// Rename a team, say you are ready, remove somebody. All three are single
// writes, so none of them has a torn-write story to tell: either the update
// lands or it does not, and the next read shows the truth either way.
//
// They return their error instead of redirecting with it. The older actions
// above put a finished sentence in the query string (issue #16) — these do not
// extend that: the message travels back through `useActionState`, never through
// a URL the user could be handed by someone else.

/** What the lobby forms get back. `value` echoes the submitted team name. */
export type LobbyResult = { error: string | null; value?: string };

const OK: LobbyResult = { error: null };

/**
 * Everything a lobby action needs to decide, read before anything is written.
 *
 * The membership id comes from a form field, so it is attacker-controlled: the
 * check that it actually belongs to `leagueId` is what stops a crafted post
 * renaming or kicking somebody in a league the sender has nothing to do with.
 * Being a member of the named league is required too — commissioning it counts,
 * since `ensureCommissionerMembership` may not have run yet.
 */
async function loadLobbyContext(formData: FormData) {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  if (!leagueId || !memberId) return null;

  const pb = await getSuperuserClient();

  let league: LeagueRecord;
  let member: MemberRecord;
  try {
    league = await pb
      .collection("leagues")
      .getOne<LeagueRecord>(leagueId, { requestKey: null });
    member = await pb
      .collection("league_members")
      .getOne<MemberRecord>(memberId, { requestKey: null });
  } catch {
    return null;
  }

  // The row must belong to the league the form claims it does.
  if (member.league !== league.id) return null;

  const actorIsCommissioner = league.commissioner === session.user.id;
  if (!actorIsCommissioner) {
    const own = await pb.collection("league_members").getFullList<MemberRecord>({
      filter: `league = '${leagueId}' && user = '${session.user.id}'`,
      requestKey: null,
    });
    if (own.length === 0) return null;
  }

  const actor: LobbyActor = {
    actorUserId: session.user.id,
    targetUserId: member.user,
    actorIsCommissioner,
    leagueStatus: league.status,
  };

  return { pb, league, member, actor };
}

/** The generic refusal. Deliberately vague — see `getLeagueWithMembers`. */
const NOT_YOURS: LobbyResult = { error: "That is not yours to change." };

export async function renameTeam(
  _previous: LobbyResult,
  formData: FormData,
): Promise<LobbyResult> {
  const raw = String(formData.get("teamName") ?? "");

  const context = await loadLobbyContext(formData);
  // Echo the submitted value back on every path: React 19 resets an
  // uncontrolled input after a server-action transition, so a rejected name
  // would otherwise vanish from the field the user is trying to fix.
  if (!context) return { ...NOT_YOURS, value: raw };

  const verdict = canRenameTeam(context.actor);
  if (!verdict.ok) return { error: verdict.reason, value: raw };

  const name = validateTeamName(raw);
  if (!name.ok) return { error: name.reason, value: raw };

  try {
    await context.pb
      .collection("league_members")
      .update(context.member.id, { team_name: name.value }, { requestKey: null });
  } catch {
    return { error: "Could not save that name. Try again.", value: raw };
  }

  revalidatePath(`/leagues/${context.league.id}`);
  return { error: null, value: name.value };
}

export async function setReady(
  _previous: LobbyResult,
  formData: FormData,
): Promise<LobbyResult> {
  const context = await loadLobbyContext(formData);
  if (!context) return NOT_YOURS;

  const verdict = canMarkReady(context.actor);
  if (!verdict.ok) return { error: verdict.reason };

  // The button posts the state it wants, not a "flip it" instruction: two taps
  // racing each other then settle on the same value instead of toggling twice.
  const ready = formData.get("ready") === "1";

  try {
    await context.pb
      .collection("league_members")
      .update(context.member.id, { is_ready: ready }, { requestKey: null });
  } catch {
    return { error: "Could not save that. Try again." };
  }

  revalidatePath(`/leagues/${context.league.id}`);
  return OK;
}

export async function kickMember(
  _previous: LobbyResult,
  formData: FormData,
): Promise<LobbyResult> {
  const context = await loadLobbyContext(formData);
  if (!context) return NOT_YOURS;

  const verdict = canKickMember(context.actor);
  if (!verdict.ok) return { error: verdict.reason };

  try {
    // A single delete. Nothing references a membership yet — picks and rosters
    // arrive in Phase 2 — so this frees the slot and leaves nothing dangling.
    // Their place is not held: they rejoin with the invite code like anyone.
    await context.pb
      .collection("league_members")
      .delete(context.member.id, { requestKey: null });
  } catch {
    return { error: "Could not remove that member. Try again." };
  }

  revalidatePath(`/leagues/${context.league.id}`);
  return OK;
}
