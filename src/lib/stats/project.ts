/**
 * Rolling last-5 and season averages — slice 4.4, extended with PIR in 9.1.
 *
 * Pure: no PocketBase, no I/O. The store reads the season's box scores, this
 * module turns one player's lines into six integers, and the store writes
 * them back. Autodraft and the pool filter never average the table themselves.
 *
 * ## Why PIR is averaged as well as fantasy points
 *
 * Fantasy points are PIR × 1.1 on a win, so the two order almost identically —
 * but they are not the same number, and the league talks in PIR because that
 * is what the Euroleague prints. 4.4 stored only the fantasy average and the
 * draft pool displayed it unlabelled, so a drafter reading `14.2` was reading
 * a bonus-inflated number under a heading that never said so. PIR is now the
 * displayed and ranked number; fantasy stays, named.
 *
 * ## Tenths, and what "absent" means
 *
 * Averages are integer tenths, same as `fantasy_pts` — including the PIR ones,
 * even though a stored `pir` is a whole number, because an average of whole
 * numbers is not one. The mean is `Math.round(…)` so a decimal never leaves
 * this file as a number.
 *
 * A player with no played games is unprojected: games = 0, averages = 0.
 * PocketBase stores unset numbers as 0, so callers must key absence off the
 * games count, not the average. Mapping to the engine's `rankPir` omits the
 * field when there is nothing to rank on — a missing projection is worse than
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
  /** The game's PIR, as a whole number — the feed's own `valuation`. */
  readonly pir: number;
};

export type PlayerProjection = {
  readonly last5Fantasy: number;
  readonly last5Games: number;
  readonly last5Pir: number;
  readonly seasonFantasy: number;
  readonly seasonGames: number;
  readonly seasonPir: number;
};

const EMPTY: PlayerProjection = {
  last5Fantasy: 0,
  last5Games: 0,
  last5Pir: 0,
  seasonFantasy: 0,
  seasonGames: 0,
  seasonPir: 0,
};

function meanTenths(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return Math.round(
    values.reduce((total, value) => total + value, 0) / values.length,
  );
}

/** The same mean, for values that arrive as whole numbers rather than tenths. */
function meanAsTenths(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return meanTenths(values.map((value) => value * 10));
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

  const last5 = played.slice(-LAST5);
  return {
    last5Fantasy: meanTenths(last5.map((line) => line.fantasyTenths)),
    last5Games: last5.length,
    last5Pir: meanAsTenths(last5.map((line) => line.pir)),
    seasonFantasy: meanTenths(played.map((line) => line.fantasyTenths)),
    seasonGames: played.length,
    seasonPir: meanAsTenths(played.map((line) => line.pir)),
  };
}

/**
 * As much of a `players` row as an average needs. Every field optional,
 * because PocketBase leaves a number unset until something writes it.
 */
export type ProjectionFields = {
  readonly proj_last5_fantasy?: number;
  readonly proj_last5_games?: number;
  readonly proj_last5_pir?: number;
  readonly prev_season_games?: number;
  readonly prev_season_pir?: number;
  readonly prev_season_fantasy?: number;
  readonly prev_season_code?: string;
};

/**
 * Which season an average is speaking about.
 *
 * Carried rather than inferred, because the two are not interchangeable to a
 * reader: `last5` is form, `prev` is last season's body of work, and a column
 * showing both without saying which is which is the defect this slice exists
 * to fix.
 */
export type AverageSource = "last5" | "prev";

export type AveragePir = {
  /** Integer tenths. */
  readonly tenths: number;
  readonly games: number;
  readonly source: AverageSource;
  /** The season code the number came from, when it came from a past one. */
  readonly season: string | null;
};

/**
 * The one average PIR, or `undefined` for a player with nothing to rank on.
 *
 * **Current form wins when it exists.** A player with games this season is
 * judged on their last five; everyone else falls back to last season's
 * average. Before tip-off nobody has current-season games, so on draft night
 * this is uniformly last season — which is the number the league is actually
 * drafting on. It stops being uniform only if a league drafts into a season
 * already under way, and then the fresher number is the right one.
 *
 * Absence is the games count, never the average: an unset column reads as 0,
 * and a genuine average of 0.0 is a real number that must still outrank a
 * player nobody has data for.
 */
export function averagePirOf(record: ProjectionFields): AveragePir | undefined {
  if ((record.proj_last5_games ?? 0) > 0) {
    return {
      tenths: record.proj_last5_pir ?? 0,
      games: record.proj_last5_games ?? 0,
      source: "last5",
      season: null,
    };
  }
  if ((record.prev_season_games ?? 0) > 0) {
    return {
      tenths: record.prev_season_pir ?? 0,
      games: record.prev_season_games ?? 0,
      source: "prev",
      season: record.prev_season_code ?? null,
    };
  }
  return undefined;
}

/**
 * The tenths the engine ranks on, or `undefined` when there is nothing.
 *
 * Kept separate from `averagePirOf` so the engine adapters have one obvious
 * call and cannot accidentally rank on the games count.
 */
export function rankPirFromRecord(record: ProjectionFields): number | undefined {
  return averagePirOf(record)?.tenths;
}

/**
 * The matching fantasy average, for the row that shows both.
 *
 * Follows whichever season `averagePirOf` chose, so the two numbers on one row
 * are never from different seasons.
 */
export function averageFantasyOf(
  record: ProjectionFields,
): number | undefined {
  const average = averagePirOf(record);
  if (!average) return undefined;
  return average.source === "last5"
    ? (record.proj_last5_fantasy ?? 0)
    : (record.prev_season_fantasy ?? 0);
}
