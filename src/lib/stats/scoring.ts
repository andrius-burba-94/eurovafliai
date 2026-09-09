/**
 * Scoring one game — pure, and checked against the Euroleague's own arithmetic.
 *
 * This is the function every number in Phase 4 is built out of: projections
 * (4.4) average it, standings (4.5) sum it. So it is held to the same standard
 * as `src/lib/engine/`: no I/O, no clock, no randomness, and the caller passes
 * everything in.
 *
 * ## PIR is not our invention, so it is not ours to get right by reasoning
 *
 * The box-score feed publishes `valuation`, which **is** PIR. That makes this
 * function falsifiable rather than merely tested: `scoring.golden.test.ts`
 * replays 168 real player rows from seven E2025 games and asserts our sum
 * equals the number the Euroleague printed for that player that night. Zero
 * mismatches, including all fourteen team totals. See
 * docs/research/euroleague-api.md for the probes.
 *
 * ## The win bonus, and the one thing we do not know
 *
 * Fantasy points are PIR plus the official 10% team-win bonus. The blueprint's
 * open question 3 is what that does to a **negative** PIR on a win: a flat
 * ×1.1 makes a bad game worse, which is at least surprising. It is applied
 * uniformly here anyway, for two reasons. The rule as published is a
 * multiplier and says nothing about a sign, so branching on it would be our
 * invention rather than theirs; and the alternative — bonus only when PIR is
 * positive — introduces a discontinuity at zero that no scoring system this
 * game is modelled on has.
 *
 * It is not a guess we are stuck with. `weights` and `winBonus` live in league
 * settings, and every component is persisted, so correcting this after Round 1
 * is a settings change plus a recompute — not a migration and not a lost
 * season. The fixture has **8 rows that are negative PIR on a win**, so
 * whatever we decide is a decision with test coverage rather than a blind spot.
 *
 * ## Tenths, never floats
 *
 * `×1.1` on an integer PIR produces one decimal place and, in binary floating
 * point, produces it badly: `3 * 1.1` is `3.3000000000000003`. Fantasy points
 * are therefore integer **tenths** everywhere — in this return value, in the
 * database column, and in any sum of them. A caller that wants to show a human
 * a number divides by 10 at the very last moment, which `formatTenths` does.
 */

/**
 * One player's line in one game, in the feed's own vocabulary.
 *
 * The names are the API's, deliberately — `blocksFavour`, and `foulsCommited`
 * with one `t`. Both import doors (the CSV in 4.1, the fetcher in 4.3) produce
 * this shape, so there is one vocabulary for these numbers and no translation
 * table to drift. Ugly beats ambiguous here.
 *
 * `fieldGoalsMadeTotal` and `fieldGoalsAttemptedTotal` are **not** fields. The
 * feed sends them and they are exactly `made2 + made3` / `attempted2 +
 * attempted3` in all 182 rows checked, so storing them would be storing a
 * number that can disagree with itself.
 */
export type BoxScore = {
  /** Seconds. The feed sends `1850` for 30:50. */
  readonly timePlayed: number;
  readonly points: number;
  readonly fieldGoalsMade2: number;
  readonly fieldGoalsAttempted2: number;
  readonly fieldGoalsMade3: number;
  readonly fieldGoalsAttempted3: number;
  readonly freeThrowsMade: number;
  readonly freeThrowsAttempted: number;
  readonly offensiveRebounds: number;
  readonly defensiveRebounds: number;
  readonly totalRebounds: number;
  readonly assistances: number;
  readonly steals: number;
  readonly turnovers: number;
  /** Blocks *by* this player. */
  readonly blocksFavour: number;
  /** This player's shots blocked by somebody else. */
  readonly blocksAgainst: number;
  readonly foulsCommited: number;
  readonly foulsReceived: number;
  readonly plusMinus: number;
};

/** The eleven PIR components, each as a signed multiplier. */
export type ScoringWeights = {
  readonly points: number;
  readonly rebounds: number;
  readonly assists: number;
  readonly steals: number;
  readonly blocksFor: number;
  readonly foulsDrawn: number;
  readonly missedFieldGoals: number;
  readonly missedFreeThrows: number;
  readonly turnovers: number;
  readonly blocksAgainst: number;
  readonly foulsCommitted: number;
};

/**
 * The official rulebook's weights: PIR exactly.
 *
 * Every negative is spelled out as a negative rather than subtracted in the
 * formula, so a league that wants to stop punishing turnovers can set one
 * number to zero without anybody re-reading `scoreGame`.
 */
export const OFFICIAL_WEIGHTS: ScoringWeights = {
  points: 1,
  rebounds: 1,
  assists: 1,
  steals: 1,
  blocksFor: 1,
  foulsDrawn: 1,
  missedFieldGoals: -1,
  missedFreeThrows: -1,
  turnovers: -1,
  blocksAgainst: -1,
  foulsCommitted: -1,
};

/** The official team-win bonus: +10%, as a multiplier on the base score. */
export const OFFICIAL_WIN_BONUS = 1.1;

export type GameScore = {
  /** The weighted base sum. With `OFFICIAL_WEIGHTS` this is PIR, exactly. */
  readonly base: number;
  /** Fantasy points in **integer tenths**. Never a float. */
  readonly fantasyTenths: number;
  /** Whether the win bonus was applied — so a caller need not re-derive it. */
  readonly wonBonus: boolean;
};

/**
 * `base` is an integer for any integer box score and integer weights, so
 * ×10 then round is exact rather than merely close. The rounding is here for
 * the case that is not exact — a league that sets a fractional weight — and
 * it rounds half away from zero so a -0.05 does not become -0.
 */
function toTenths(value: number): number {
  const scaled = value * 10;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/**
 * Score one game line.
 *
 * `teamWon` is the caller's to determine, and for the API feed that means
 * **comparing the two scores** — never reading the game record's `winner`
 * field, which carries the season's champion on every game in the season and
 * would hand one club a bonus in all 38 rounds and nobody else one, ever.
 * Recorded in the research file with the table that shows it.
 */
export function scoreGame(
  box: BoxScore,
  teamWon: boolean,
  weights: ScoringWeights = OFFICIAL_WEIGHTS,
  winBonus: number = OFFICIAL_WIN_BONUS,
): GameScore {
  const missedFieldGoals =
    box.fieldGoalsAttempted2 +
    box.fieldGoalsAttempted3 -
    (box.fieldGoalsMade2 + box.fieldGoalsMade3);
  const missedFreeThrows = box.freeThrowsAttempted - box.freeThrowsMade;

  const base =
    box.points * weights.points +
    box.totalRebounds * weights.rebounds +
    box.assistances * weights.assists +
    box.steals * weights.steals +
    box.blocksFavour * weights.blocksFor +
    box.foulsReceived * weights.foulsDrawn +
    missedFieldGoals * weights.missedFieldGoals +
    missedFreeThrows * weights.missedFreeThrows +
    box.turnovers * weights.turnovers +
    box.blocksAgainst * weights.blocksAgainst +
    box.foulsCommited * weights.foulsCommitted;

  return {
    base,
    fantasyTenths: toTenths(teamWon ? base * winBonus : base),
    wonBonus: teamWon,
  };
}

/**
 * Integer tenths as a human reads them: `33` → `"3.3"`, `-11` → `"-1.1"`.
 *
 * The one place tenths become a decimal, and it happens in a string rather
 * than in a number so nothing downstream can accumulate the error this whole
 * scheme exists to avoid.
 */
export function formatTenths(tenths: number): string {
  const sign = tenths < 0 ? "-" : "";
  const absolute = Math.abs(tenths);
  return `${sign}${Math.trunc(absolute / 10)}.${absolute % 10}`;
}

/** A signed fantasy total for deltas. Hyphen, never an em dash. */
export function formatSignedTenths(tenths: number): string {
  if (tenths < 0) return formatTenths(tenths);
  return `+${formatTenths(tenths)}`;
}

/** A sum of tenths is still tenths — provided nobody divided on the way in. */
export function sumTenths(values: readonly number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
