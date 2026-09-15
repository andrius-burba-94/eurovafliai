"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { announceLineup } from "@/lib/chat/messages";
import { announce } from "@/lib/chat/store";
import { isManager } from "@/lib/leagues/lobby";
import { lineupFitsRoster, parseLeagueSettings } from "@/lib/leagues/settings";
import type { LeagueRecord, MemberRecord } from "@/lib/leagues/types";
import { getSuperuserClient } from "@/lib/pb/superuser";
import { recomputeStandings } from "@/lib/stats/standings-store";

import {
  assignmentsWithCaptain,
  type PlacementRole,
  PLACEMENT_ROLES,
  slotsFromRoles,
  validateLineup,
} from "./lineup";
import { readSquadWithPositions, writeLineup } from "./store";

/**
 * Record one round's lineup — slice 9.3.
 *
 * The owner sets their own; the commissioner (or a deputy) sets anyone's, which
 * is the point: the league is played on the official site and typed in here
 * afterwards, so the person with the screenshot is not always the person whose
 * team it is.
 *
 * ## Failure-recovery story
 *
 * 1. Validate against the membership windows for that round — a lineup naming
 *    a player who was not on the roster that night is refused, not stored.
 * 2. One write, one JSON field, upserted on the unique index.
 * 3. Recompute this league's standings for that season, because the multiplier
 *    lives in `computeStandings` and box scores never carry it.
 * 4. `announce()` last, and it never throws.
 *
 * A crash after (2) leaves a stored lineup and a stale table; the next ingest,
 * the next recorded lineup, or `npm run standings:recompute` is the repair.
 */

export type LineupResult = { error: string | null; saved: boolean };

function isPlacementRole(value: string): value is PlacementRole {
  return (PLACEMENT_ROLES as readonly string[]).includes(value);
}

/**
 * The form posts one `role:<playerId>` per player, so the assignments arrive in
 * the order the roster was rendered and the starting five keeps that order.
 *
 * `captain` is **not** accepted here, and a posted one is dropped rather than
 * honoured: the captaincy arrives in its own field, from the radio group that
 * makes it exclusive. Two doors onto one fact is how a form ends up naming two
 * captains, and `slotsFromRoles` would silently keep the first of them.
 */
function placementsFrom(
  formData: FormData,
): { playerId: string; role: PlacementRole }[] {
  const out: { playerId: string; role: PlacementRole }[] = [];
  for (const [key, value] of formData.entries()) {
    if (!key.startsWith("role:")) continue;
    const playerId = key.slice("role:".length);
    const role = String(value);
    if (!playerId || !isPlacementRole(role)) continue;
    out.push({ playerId, role });
  }
  return out;
}

function teamLabel(member: MemberRecord): string {
  const named = member.team_name.trim();
  if (named) return named;
  return member.expand?.user?.name || "Unknown";
}

export async function recordLineup(
  _previous: LineupResult,
  formData: FormData,
): Promise<LineupResult> {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  const memberId = String(formData.get("memberId") ?? "");
  const season = String(formData.get("season") ?? "");
  const round = Number.parseInt(String(formData.get("round") ?? ""), 10);

  if (!leagueId || !memberId || !season) {
    return { error: "That lineup is missing its league.", saved: false };
  }
  if (!Number.isInteger(round) || round < 1) {
    return { error: "Say which round this lineup is for.", saved: false };
  }

  const pb = await getSuperuserClient();
  let league: LeagueRecord;
  try {
    league = await pb
      .collection("leagues")
      .getOne<LeagueRecord>(leagueId, { requestKey: null });
  } catch {
    return { error: "That league is not here.", saved: false };
  }
  if (league.status !== "season") {
    return {
      error: "Lineups start once the draft is complete.",
      saved: false,
    };
  }

  const members = await pb
    .collection("league_members")
    .getFullList<MemberRecord>({
      filter: `league = '${leagueId}'`,
      expand: "user",
      requestKey: null,
    });
  const own = members.find((member) => member.user === session.user.id);
  const target = members.find((member) => member.id === memberId);
  if (!target) return { error: "That team is not in this league.", saved: false };

  const actorIsCommissioner = league.commissioner === session.user.id;
  const ownsIt = own?.id === memberId;
  const manages = isManager({
    actorUserId: session.user.id,
    targetUserId: session.user.id,
    actorIsCommissioner,
    actorCanManage: Boolean(own?.can_manage),
    leagueStatus: league.status,
  });
  if (!ownsIt && !manages) {
    return { error: "That lineup is not yours to set.", saved: false };
  }

  const settings = parseLeagueSettings(league.settings);
  if (!lineupFitsRoster(settings.lineup_template, settings.roster_template)) {
    return {
      error:
        "This league's lineup shape does not have one place per roster slot. Fix the settings before recording a lineup.",
      saved: false,
    };
  }

  const squad = await readSquadWithPositions(pb, leagueId, memberId, round);
  const verdict = validateLineup({
    slots: slotsFromRoles(
      assignmentsWithCaptain(
        placementsFrom(formData),
        String(formData.get("captain") ?? ""),
      ),
    ),
    template: settings.lineup_template,
    squad,
  });
  if (!verdict.ok) return { error: verdict.reason, saved: false };

  await writeLineup(pb, {
    leagueId,
    memberId,
    season,
    round,
    slots: verdict.slots,
    recordedBy: session.user.id,
  });

  await recomputeStandings(pb, season, { leagueId });

  const captain = await pb
    .collection("players")
    .getOne<{ name: string }>(verdict.slots.captain, {
      fields: "name",
      requestKey: null,
    })
    .catch(() => null);
  await announce(
    pb,
    leagueId,
    announceLineup({
      teamName: teamLabel(target),
      captainName: captain?.name ?? "their captain",
      round,
    }),
  );

  revalidatePath(`/leagues/${leagueId}/lineup`);
  revalidatePath(`/leagues/${leagueId}/standings`);
  revalidatePath(`/leagues/${leagueId}/teams/${memberId}`);
  revalidatePath(`/leagues/${leagueId}`);

  return { error: null, saved: true };
}
