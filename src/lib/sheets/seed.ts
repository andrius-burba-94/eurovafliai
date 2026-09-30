/**
 * A first sheet, written for you.
 *
 * Pure. Ranks the pool by the same average PIR the draft room sorts on, so a
 * member who never opens a spreadsheet still starts from a sensible order and
 * spends their time moving the players they disagree about. Players with no
 * games anywhere sort last, by name, because "unknown" is not "bad" and the
 * order among them should at least be stable.
 */

export type RankablePlayer = {
  readonly id: string;
  readonly name: string;
  /** Average PIR in tenths, or null when there is nothing to average. */
  readonly tenths: number | null;
};

export function rankByAveragePir<P extends RankablePlayer>(
  players: readonly P[],
): P[] {
  return [...players].sort((a, b) => {
    if (a.tenths === null && b.tenths === null) return a.name.localeCompare(b.name);
    if (a.tenths === null) return 1;
    if (b.tenths === null) return -1;
    return b.tenths - a.tenths || a.name.localeCompare(b.name);
  });
}

/** How deep a written-for-you sheet goes: comfortably past a 13-round roster. */
export const SEED_DEPTH = 60;

/** The best-ranked players the sheet does not have yet, for "add to sheet". */
export function suggestionsFor<P extends RankablePlayer>(
  players: readonly P[],
  ranked: ReadonlySet<string>,
  limit: number,
): P[] {
  return rankByAveragePir(players.filter((player) => !ranked.has(player.id))).slice(0, limit);
}
