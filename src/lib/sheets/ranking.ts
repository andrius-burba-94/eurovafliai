/**
 * A cheat sheet's stored shape, and the one piece of arithmetic over it.
 *
 * Split out from `match.ts` so that reading a sheet does not mean importing the
 * thing that *builds* one: matching needs fuse.js, and the draft room only ever
 * needs to know which tier a rank falls in. Every consumer that reads a stored
 * sheet — the room's query, the store, the list — stops here.
 */

export type SheetRanking = {
  /** Player ids, best first. */
  readonly ranking: string[];
  /**
   * Where the tiers break, as counts of players **before** each break. A
   * ranking of ten with `[3, 7]` is 1–3, 4–7, 8–10.
   *
   * Breaks rather than per-player labels, because CONTEXT.md defines a tier as
   * "a break in a cheat sheet" — and because 3.4b drags rows around: a break
   * that lives *between* two positions stays where it was put when the players
   * either side of it move, while a label attached to a player travels with
   * them and silently re-groups the sheet.
   */
  readonly tiers: number[];
};

/** Which tier a rank falls in, 1-based. `tiers` are break positions. */
export function tierOfRank(rank: number, tiers: readonly number[]): number {
  let tier = 1;
  for (const brk of tiers) {
    if (rank > brk) tier += 1;
    else break;
  }
  return tier;
}
