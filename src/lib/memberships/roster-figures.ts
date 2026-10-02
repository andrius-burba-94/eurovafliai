/**
 * A player's figures while on one roster, from their box-score lines. Pure.
 *
 * "Last" is the player's own latest game on this roster, not the league's
 * latest round: halfway through a round most clubs have not played yet, and
 * a dash for everyone whose game is tomorrow says nothing.
 */
export type RosterFigures = {
  readonly seasonTenths: number;
  readonly games: number;
  readonly lastTenths: number | null;
  readonly lastRound: number | null;
};

export function rosterFigures(
  lines: readonly { readonly player: string; readonly round: number; readonly fantasy_pts: number }[],
  playerId: string,
  fromRound: number | null | undefined,
): RosterFigures {
  const from = fromRound && fromRound > 0 ? fromRound : 1;
  const owned = lines.filter((line) => line.player === playerId && line.round >= from);
  const last = owned.reduce<(typeof owned)[number] | null>((latest, line) => (!latest || line.round > latest.round ? line : latest), null);
  return {
    seasonTenths: owned.reduce((sum, line) => sum + line.fantasy_pts, 0),
    games: owned.length,
    lastTenths: last ? last.fantasy_pts : null,
    lastRound: last ? last.round : null,
  };
}
