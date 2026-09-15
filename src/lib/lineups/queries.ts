import "server-only";

import { getSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { coversRound } from "@/lib/memberships/from";
import { createUserClient } from "@/lib/pb/server";

import {
  type LineupRole,
  type LineupSlots,
  type LineupSource,
  resolveLineups,
  rolesFromSlots,
} from "./lineup";
import { slotsFrom } from "./store";

/**
 * What the lineup page reads — slice 9.3.
 *
 * The viewer's own token, so the collection's read rule is what scopes it, the
 * same discipline every other read surface here follows.
 */

type LineupRecord = {
  member: string;
  round: number;
  slots: unknown;
};

type MembershipRow = {
  member: string;
  player: string;
  from_round?: number | null;
  to_round?: number | null;
  to_date?: string | null;
  expand?: {
    player?: {
      id: string;
      name: string;
      club_code: string;
      club_name: string;
      position: Position;
    };
  };
};

export type LineupPlayer = {
  readonly id: string;
  readonly name: string;
  readonly clubCode: string;
  readonly clubName: string;
  readonly position: Position;
  /** What the round's lineup says today. Null when nobody has said. */
  readonly role: LineupRole | null;
};

export type LineupBoard = {
  readonly players: readonly LineupPlayer[];
  readonly source: LineupSource;
  /** The round a carried lineup was actually typed for. */
  readonly carriedFrom: number | null;
};

async function readLineupRecords(
  pb: ReturnType<typeof createUserClient>,
  leagueId: string,
  season: string,
  memberId?: string,
): Promise<LineupRecord[]> {
  const scope = memberId ? ` && member = '${memberId}'` : "";
  return pb.collection("round_lineups").getFullList<LineupRecord>({
    filter: `league = '${leagueId}' && season = "${season}"${scope}`,
    fields: "member,round,slots",
    requestKey: null,
  });
}

/**
 * One member's roster for one round, with the lineup that round scores at.
 *
 * The squad comes from membership windows rather than today's roster, so a
 * lineup typed in November for round 4 names the thirteen who played it.
 */
export async function readLineupBoard(input: {
  readonly leagueId: string;
  readonly memberId: string;
  readonly season: string;
  readonly round: number;
}): Promise<LineupBoard | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);
  const [memberships, records] = await Promise.all([
    pb.collection("roster_memberships").getFullList<MembershipRow>({
      filter: `league = '${input.leagueId}' && member = '${input.memberId}'`,
      expand: "player",
      requestKey: null,
    }),
    readLineupRecords(pb, input.leagueId, input.season, input.memberId),
  ]);

  const seen = new Set<string>();
  const squad: Omit<LineupPlayer, "role">[] = [];
  for (const row of memberships) {
    const player = row.expand?.player;
    if (!player || seen.has(player.id)) continue;
    if (!coversRound(row, input.round)) continue;
    seen.add(player.id);
    squad.push({
      id: player.id,
      name: player.name,
      clubCode: player.club_code,
      clubName: player.club_name,
      position: player.position,
    });
  }
  squad.sort((a, b) => a.name.localeCompare(b.name));

  const recorded = records.flatMap((row) => {
    const slots = slotsFrom(row.slots);
    return slots
      ? [{ memberId: input.memberId, round: row.round, slots }]
      : [];
  });
  const [resolved] = resolveLineups({
    recorded,
    rounds: [input.round],
    memberIds: [input.memberId],
  });
  const slots: LineupSlots | null = resolved?.slots ?? null;
  const roles = slots ? rolesFromSlots(slots) : new Map<string, LineupRole>();
  const carriedFrom =
    resolved?.source === "carried"
      ? (recorded
          .filter((row) => row.round < input.round)
          .sort((a, b) => b.round - a.round)[0]?.round ?? null)
      : null;

  return {
    players: squad.map((player) => ({
      ...player,
      role: roles.get(player.id) ?? null,
    })),
    source: resolved?.source ?? "absent",
    carriedFrom,
  };
}

/**
 * The rounds the table is only provisionally right about: nobody has recorded
 * a lineup on or before them for at least one team, so every player in those
 * rounds counted at 100%. Named on the standings page as a `Correction` rather
 * than left to look final.
 */
export async function readProvisionalRounds(input: {
  readonly leagueId: string;
  readonly season: string;
  readonly rounds: readonly number[];
  readonly memberIds: readonly string[];
}): Promise<number[]> {
  const session = await getSession();
  if (!session) return [];

  const pb = createUserClient(session.token);
  const records = await readLineupRecords(pb, input.leagueId, input.season);
  const recorded = records.flatMap((row) => {
    const slots = slotsFrom(row.slots);
    return slots ? [{ memberId: row.member, round: row.round, slots }] : [];
  });
  const resolved = resolveLineups({
    recorded,
    rounds: input.rounds,
    memberIds: input.memberIds,
  });
  const provisional = new Set<number>();
  for (const row of resolved) {
    if (row.source === "absent") provisional.add(row.round);
  }
  return [...provisional].sort((a, b) => a - b);
}
