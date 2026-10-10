import "server-only";

import { getSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { createUserClient } from "@/lib/pb/server";
import type { LeagueSource } from "@/lib/positions";

import { readScoutWith, type ScoutRead } from "./read";

export type ScoutPage = ScoutRead;

/**
 * The league's waiver wire and the viewer's own moves worth making, read with
 * the member's token (7.2 E, F). Free agents come from the board, so a linked
 * league lists only the players its game lists, and a player signed since the
 * last read is gone from both. Outlooks are the stored ones, never computed
 * here; the moves are worked out from them at read time.
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
  return readScoutWith(createUserClient(session.token), { leagueId, source, season, memberId, template });
}
