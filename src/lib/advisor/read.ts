import type PocketBase from "pocketbase";

import type { Position } from "@/lib/engine";
import { readBoard } from "@/lib/memberships/board";
import type { LeagueSource } from "@/lib/positions";

import type { Ruleset } from "./outlook";
import { scoutFor, type ScoutMove, type ScoutView } from "./scout";
import type { StoredOutlook } from "./wire";

/**
 * The Scout's reads, framework-free — 7.2 E, F, G. The page passes the
 * member's own client; the worker's scout pass passes the superuser's and
 * asks for every member at once. Moves are worked out here from stored
 * outlooks, never stored themselves.
 */

export function rulesetOf(source: LeagueSource): Ruleset {
  return source === "basketnews" ? "basketnews" : "euroleague";
}

const OUTLOOK_FIELDS =
  "player,outlook_5,outlook_10,outlook_15,games_ahead,role,games_in_role,base_source,run_5,run_10,run_15,rate_per_minute,minutes,starts_recent,games_recent,win_chance_5";

async function readInputs(pb: PocketBase, leagueId: string, season: string, ruleset: Ruleset) {
  return Promise.all([
    readBoard(pb, leagueId),
    pb.collection("player_outlooks").getFullList<StoredOutlook>({
      filter: `season = "${season.replace(/[^A-Za-z0-9]/g, "")}" && ruleset = "${ruleset}"`,
      fields: OUTLOOK_FIELDS,
      requestKey: null,
    }),
  ]);
}

export type ScoutRead = ScoutView & {
  readonly ruleset: Ruleset;
  /** Outlooks stored for this ruleset at all: zero before the worker's first pass. */
  readonly rated: number;
};

export async function readScoutWith(
  pb: PocketBase,
  {
    leagueId,
    source,
    season,
    memberId,
    template,
  }: {
    leagueId: string;
    source: LeagueSource;
    season: string;
    memberId: string | null;
    template: Readonly<Record<Position, number>>;
  },
): Promise<ScoutRead> {
  const ruleset = rulesetOf(source);
  const [board, outlooks] = await readInputs(pb, leagueId, season, ruleset);
  return {
    ruleset,
    rated: outlooks.length,
    ...scoutFor({ seats: board.seats, freeAgents: board.freeAgents, outlooks, template, memberId, ruleset }),
  };
}

/** Every member's moves in one league, for the reasons' fact sheet. Members with none are left out. */
export async function readLeagueMoves(
  pb: PocketBase,
  {
    leagueId,
    source,
    season,
    template,
  }: { leagueId: string; source: LeagueSource; season: string; template: Readonly<Record<Position, number>> },
): Promise<{ ruleset: Ruleset; members: { memberId: string; moves: ScoutMove[] }[] }> {
  const ruleset = rulesetOf(source);
  const [board, outlooks] = await readInputs(pb, leagueId, season, ruleset);
  const memberIds = [...new Set(board.seats.map((seat) => seat.member))].sort();
  const members = memberIds.flatMap((memberId) => {
    const { moves } = scoutFor({ seats: board.seats, freeAgents: board.freeAgents, outlooks, template, memberId, ruleset }).advice;
    return moves.length > 0 ? [{ memberId, moves }] : [];
  });
  return { ruleset, members };
}
