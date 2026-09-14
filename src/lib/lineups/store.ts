import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";
import { coversRound } from "@/lib/memberships/from";

import {
  type LineupSlots,
  type LineupSquadPlayer,
  lineupWeights,
  type LineupWeights,
  type RecordedLineup,
  resolveLineups,
} from "./lineup";

/**
 * Reading and writing lineups — the PocketBase half of slice 9.3.
 *
 * Framework-free: `recomputeStandings` runs in the worker and in a script, the
 * entry action runs in a request, and all three have to weigh a round the same
 * way or two surfaces will print different totals.
 *
 * ## Failure-recovery story
 *
 * One row per `(league, member, season, round)`, one JSON `slots` field, so a
 * write either landed or did not — there is no half-written lineup to repair,
 * which matters because PocketBase has no transactions. A resubmit updates the
 * row; a create that loses a race is caught on the unique index and retried as
 * the update it always was. Nothing here deletes: a round the league stopped
 * caring about still scored the way it scored.
 */

type LineupRecord = {
  id: string;
  member: string;
  round: number;
  slots: unknown;
};

type MembershipRef = {
  member: string;
  player: string;
  from_round?: number | null;
  to_round?: number | null;
  to_date?: string | null;
};

function asIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((id): id is string => typeof id === "string" && id.length > 0);
}

/**
 * A stored payload is JSON PocketBase never validated, so it is read the way
 * every other JSON column in this app is: field by field, with a shape that
 * cannot throw. A lineup that came back unreadable weighs nothing — the round
 * falls back to 100%, which is the provisional case we already handle.
 */
export function slotsFrom(raw: unknown): LineupSlots | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const value = raw as Record<string, unknown>;
  const starters = asIds(value.starters);
  const captain = typeof value.captain === "string" ? value.captain : "";
  if (starters.length === 0 || !captain) return null;
  return {
    starters,
    captain,
    sixth: asIds(value.sixth),
    bench: asIds(value.bench),
    inactive: asIds(value.inactive),
  };
}

export async function readRecordedLineups(
  pb: PocketBase,
  leagueId: string,
  season: string,
): Promise<RecordedLineup[]> {
  const rows = await pb.collection("round_lineups").getFullList<LineupRecord>({
    filter: `league = '${leagueId}' && season = "${season}"`,
    fields: "id,member,round,slots",
    requestKey: null,
  });
  return rows.flatMap((row) => {
    const slots = slotsFrom(row.slots);
    if (!slots) return [];
    return [{ memberId: row.member, round: row.round, slots }];
  });
}

/** The lineup weights one league scores a set of rounds at. */
export async function readLineupWeights(
  pb: PocketBase,
  leagueId: string,
  season: string,
  rounds: readonly number[],
  memberIds: readonly string[],
): Promise<LineupWeights> {
  const recorded = await readRecordedLineups(pb, leagueId, season);
  return lineupWeights(resolveLineups({ recorded, rounds, memberIds }));
}

/**
 * The squad a member owned for one Euroleague round — membership windows, not
 * today's roster, so a lineup typed in November for round 4 names the players
 * who actually played it.
 */
export async function readSquadForRound(
  pb: PocketBase,
  leagueId: string,
  memberId: string,
  round: number,
): Promise<string[]> {
  const rows = await pb
    .collection("roster_memberships")
    .getFullList<MembershipRef>({
      filter: `league = '${leagueId}' && member = '${memberId}'`,
      fields: "member,player,from_round,to_round,to_date",
      requestKey: null,
    });
  const owned = rows
    .filter((row) => coversRound(row, round))
    .map((row) => row.player);
  return [...new Set(owned)];
}

export type LineupWrite = {
  readonly leagueId: string;
  readonly memberId: string;
  readonly season: string;
  readonly round: number;
  readonly slots: LineupSlots;
  readonly recordedBy: string;
};

export async function writeLineup(
  pb: PocketBase,
  write: LineupWrite,
): Promise<"created" | "updated"> {
  const body = {
    league: write.leagueId,
    member: write.memberId,
    season: write.season,
    round: write.round,
    slots: write.slots,
    source: "recorded",
    recorded_by: write.recordedBy,
  };
  const where =
    `league = '${write.leagueId}' && member = '${write.memberId}' && ` +
    `season = "${write.season}" && round = ${write.round}`;

  const existing = await pb
    .collection("round_lineups")
    .getFullList<LineupRecord>({ filter: where, fields: "id", requestKey: null });
  const row = existing[0];
  if (row) {
    await pb
      .collection("round_lineups")
      .update(row.id, body, { requestKey: null });
    return "updated";
  }
  try {
    await pb.collection("round_lineups").create(body, { requestKey: null });
    return "created";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await pb
      .collection("round_lineups")
      .getFullList<LineupRecord>({ filter: where, fields: "id", requestKey: null });
    const lost = raced[0];
    if (lost) {
      await pb
        .collection("round_lineups")
        .update(lost.id, body, { requestKey: null });
    }
    return "updated";
  }
}

/** The squad with positions, which is what the validator needs. */
export async function readSquadWithPositions(
  pb: PocketBase,
  leagueId: string,
  memberId: string,
  round: number,
): Promise<LineupSquadPlayer[]> {
  const ids = await readSquadForRound(pb, leagueId, memberId, round);
  if (ids.length === 0) return [];
  const players = await pb.collection("players").getFullList<{
    id: string;
    position: LineupSquadPlayer["position"];
  }>({
    filter: ids.map((id) => `id = '${id}'`).join(" || "),
    fields: "id,position",
    requestKey: null,
  });
  return players.map((player) => ({
    playerId: player.id,
    position: player.position,
  }));
}
