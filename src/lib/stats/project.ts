/**
 * Rolling last-5 and season fantasy averages — slice 4.4.
 *
 * Pure: no PocketBase, no I/O. The store reads the season's box scores, this
 * module turns one player's lines into four integers, and the store writes
 * them back. Autodraft and the pool filter never average the table themselves.
 *
 * ## Tenths, and what "absent" means
 *
 * Averages are integer tenths, same as `fantasy_pts`. The mean is
 * `Math.round(sum / n)` so a decimal never leaves this file as a number.
 *
 * A player with no played games is unprojected: games = 0, averages = 0.
 * PocketBase stores unset numbers as 0, so callers must key absence off the
 * games count, not the average. Mapping to the engine's `projectedPoints`
 * omits the field when last-5 games is 0 — a missing projection is worse than
 * a genuine −2, which is the comparator `rankForMember` already has.
 *
 * ## What counts as a game
 *
 * `timePlayed > 0`. A DNP does not occupy a last-5 slot. Order is
 * `(round, gameCode)` — `player_game_stats` has no date column.
 */

export const LAST5 = 5;

export type PlayerGameLine = {
  readonly round: number;
  readonly gameCode: number;
  readonly timePlayed: number;
  readonly fantasyTenths: number;
};

export type PlayerProjection = {
  readonly last5Fantasy: number;
  readonly last5Games: number;
  readonly seasonFantasy: number;
  readonly seasonGames: number;
};

const EMPTY: PlayerProjection = {
  last5Fantasy: 0,
  last5Games: 0,
  seasonFantasy: 0,
  seasonGames: 0,
};

function meanTenths(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

function byWhen(a: PlayerGameLine, b: PlayerGameLine): number {
  if (a.round !== b.round) return a.round - b.round;
  return a.gameCode - b.gameCode;
}

export function projectPlayer(
  lines: readonly PlayerGameLine[],
): PlayerProjection {
  const played = [...lines]
    .filter((line) => line.timePlayed > 0)
    .sort(byWhen);
  if (played.length === 0) return EMPTY;

  const season = played.map((line) => line.fantasyTenths);
  const last5 = season.slice(-LAST5);
  return {
    last5Fantasy: meanTenths(last5),
    last5Games: last5.length,
    seasonFantasy: meanTenths(season),
    seasonGames: season.length,
  };
}

/**
 * Last-5 tenths for the engine, or `undefined` when the player has not played.
 *
 * `0` games is absent even if the average column is 0, which it always is
 * when PocketBase has never written the field.
 */
export function projectedPointsOf(
  projection: Pick<PlayerProjection, "last5Fantasy" | "last5Games">,
): number | undefined {
  if (projection.last5Games <= 0) return undefined;
  return projection.last5Fantasy;
}

export function projectedPointsFromRecord(record: {
  readonly proj_last5_fantasy?: number;
  readonly proj_last5_games?: number;
}): number | undefined {
  return projectedPointsOf({
    last5Fantasy: record.proj_last5_fantasy ?? 0,
    last5Games: record.proj_last5_games ?? 0,
  });
}
