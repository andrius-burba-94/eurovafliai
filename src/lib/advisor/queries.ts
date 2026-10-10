import "server-only";

import { getSession } from "@/lib/auth/session";
import { readTransactionBoard } from "@/lib/memberships/queries";
import { createUserClient } from "@/lib/pb/server";
import type { LeagueSource } from "@/lib/positions";

import type { Ruleset } from "./outlook";
import { waiverWire, type StoredOutlook, type WireRow } from "./wire";

export type WaiverWirePage = {
  readonly ruleset: Ruleset;
  readonly rows: WireRow[];
  /** Outlooks stored for this ruleset at all: zero before the worker's first pass. */
  readonly rated: number;
};

export function rulesetOf(source: LeagueSource): Ruleset {
  return source === "basketnews" ? "basketnews" : "euroleague";
}

/**
 * The league's waiver wire, read with the member's token (7.2 E). Free agents
 * come from the transaction board, so a linked league lists only the players
 * its game lists; outlooks are the stored ones, never computed here.
 */
export async function readWaiverWire(
  leagueId: string,
  { source, season }: { source: LeagueSource; season: string },
): Promise<WaiverWirePage | null> {
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
  return { ruleset, rows: waiverWire({ freeAgents: board.freeAgents, outlooks }), rated: outlooks.length };
}
