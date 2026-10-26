import type { Position, RosterTemplate } from "@/lib/engine";
import type { LeagueSource } from "@/lib/positions";
import { linkSourcePlayers, resolveClubs, type PoolPlayer } from "@/lib/fantasy/match";
import type { FantasyPlayer } from "@/lib/fantasy/parse";

/**
 * One game's positions read, planned against what is stored (7.2 D).
 *
 * Pure. A read only ever **adds**: a player with no position in that game gets
 * the one it lists, and a stored position the read disagrees with becomes a
 * question for a person. A confirmed position is never touched, so a
 * commissioner answers each disagreement once. Planning again after the plan
 * is written returns nothing, which is what makes a read that died halfway
 * safe to run again.
 */

/** A game that classifies players its own way. */
export type PositionSource = Exclude<LeagueSource, "euroleague">;

/** A stored player, with what is stored about him for one game. */
export type StoredPlayer = PoolPlayer & {
  /** His id in that game, or "" when never linked. */
  readonly sourceId: string;
  readonly position: Position | null;
  readonly confirmed: boolean;
  readonly listed: boolean;
};

export type PositionQuestion = { readonly playerId: string; readonly stored: Position; readonly read: Position };

export type PositionPlan = {
  readonly links: readonly { playerId: string; sourceId: string }[];
  readonly additions: readonly { playerId: string; position: Position }[];
  readonly questions: readonly PositionQuestion[];
  /** Only the players whose listed flag changes. */
  readonly listed: readonly { playerId: string; listed: boolean }[];
  /** Every player this read placed, agreeing or not: only about them does the read say anything. */
  readonly placed: readonly string[];
  /** Listed by the game, placed on nobody: no position is written for them. */
  readonly unmatched: readonly FantasyPlayer[];
};

export function planPositionRead(read: readonly FantasyPlayer[], stored: readonly StoredPlayer[]): PositionPlan {
  // A link is never moved, and two of the game's players on one of ours are
  // neither of them certain: both stay unmatched.
  const { mapped, links } = linkSourcePlayers({ read: read.map((player) => ({ player, teamName: "" })), pool: stored, idOf: (player) => player.sourceId });
  const byId = new Map(stored.map((player) => [player.id, player]));

  const additions: { playerId: string; position: Position }[] = [];
  const questions: PositionQuestion[] = [];
  const unmatched: FantasyPlayer[] = [];
  const listedNow = new Set<string>();
  for (const entry of read) {
    const playerId = mapped.get(entry.id);
    if (!playerId) {
      unmatched.push(entry);
      continue;
    }
    if (listedNow.has(playerId)) continue;
    listedNow.add(playerId);
    const player = byId.get(playerId)!;
    if (player.position === null) additions.push({ playerId, position: entry.position });
    else if (player.position !== entry.position && !player.confirmed) {
      questions.push({ playerId, stored: player.position, read: entry.position });
    }
  }

  // A club the read did not include says nothing about its players: a future
  // matchday leaves out clubs whose game is not yet placed (7.2 A).
  const clubsRead = new Set(resolveClubs([{ id: "pool", name: "", manager: "", players: [...read] }], stored).values());
  const listed: { playerId: string; listed: boolean }[] = [];
  for (const player of stored) {
    if (listedNow.has(player.id) && !player.listed) listed.push({ playerId: player.id, listed: true });
    if (!listedNow.has(player.id) && player.listed && clubsRead.has(player.clubCode)) {
      listed.push({ playerId: player.id, listed: false });
    }
  }

  return { links, additions, questions, listed, placed: [...listedNow], unmatched };
}

/** Whether a roster counts exactly the template, position by position. */
export function countsTemplate(positions: readonly Position[], template: RosterTemplate): boolean {
  const counts: Record<Position, number> = { G: 0, F: 0, C: 0 };
  for (const position of positions) counts[position] += 1;
  return counts.G === template.G && counts.F === template.F && counts.C === template.C;
}

/**
 * A linked league's free agents are the players its game lists (7.2 D): a
 * player it does not list cannot be signed there. Until the league's first
 * positions read nobody is marked listed, and the whole pool stands in.
 */
export function signableIn<T extends { basketnews_listed?: boolean; fantasy_listed?: boolean }>(
  pool: readonly T[],
  source: LeagueSource,
): T[] {
  if (source === "euroleague") return [...pool];
  const listed = (player: T) => (source === "basketnews" ? player.basketnews_listed : player.fantasy_listed) === true;
  return pool.some(listed) ? pool.filter(listed) : [...pool];
}
