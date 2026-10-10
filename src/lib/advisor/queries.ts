import "server-only";

import { getSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { readTransactionBoard } from "@/lib/memberships/queries";
import { createUserClient } from "@/lib/pb/server";
import type { LeagueSource } from "@/lib/positions";

import type { Ruleset } from "./outlook";
import { scoutFor, type ScoutView } from "./scout";
import type { StoredOutlook } from "./wire";

export type ScoutPage = ScoutView & {
  readonly ruleset: Ruleset;
  /** Outlooks stored for this ruleset at all: zero before the worker's first pass. */
  readonly rated: number;
};

export function rulesetOf(source: LeagueSource): Ruleset {
  return source === "basketnews" ? "basketnews" : "euroleague";
}

/**
 * The league's waiver wire and the viewer's own moves worth making, read with
 * the member's token (7.2 E, F). Free agents come from the transaction board,
 * so a linked league lists only the players its game lists, and a player
 * signed since the last read is gone from both. Outlooks are the stored ones,
 * never computed here; the moves are worked out from them at read time.
 */
export async function readScout(
  leagueId: string,
  {
    source,
    season,
    memberId,
    template,
  }: { source: LeagueSource; season: string; memberId: string | null; template: Readonly<Record<Position, number>> },
): Promise<ScoutPage | null> {
  const session = await getSession();
  if (!session) return null;
  const ruleset = rulesetOf(source);
  const pb = createUserClient(session.token);
  const [board, outlooks] = await Promise.all([
    readTransactionBoard(leagueId),
    pb.collection("player_outlooks").getFullList<StoredOutlook>({
      filter: `season = "${season.replace(/[^A-Za-z0-9]/g, "")}" && ruleset = "${ruleset}"`,
      fields: "player,outlook_5,outlook_10,outlook_15,games_ahead,role,games_in_role,base_source,run_5,run_10,run_15",
      requestKey: null,
    }),
  ]);
  if (!board) return null;
  return {
    ruleset,
    rated: outlooks.length,
    ...scoutFor({ seats: board.seats, freeAgents: board.freeAgents, outlooks, template, memberId, ruleset }),
  };
}
