/**
 * What a club has coming.
 *
 * Shipped as a shape ahead of the data in 10.5 and filled in by 10.7, which is
 * also where it lost a field: `doubleRound` is gone, because the Euroleague
 * cannot produce one. Every club plays exactly once in every round — measured
 * across E2025 and E2026, 1,564 club-rounds, no exceptions — so a flag that
 * would always read `false` was a promise about somebody else's competition.
 * The argument is in `schedule.ts` and the measurement in
 * docs/research/euroleague-api.md.
 *
 * What replaced it is the one thing the schedule knows that changes how a
 * fixture reads: whether it is at home.
 *
 * It is a type-only module deliberately: a server query, a client component and
 * a page all need to agree on the shape, and a type in `src/components/` that
 * the server imports is a client module the server has taken a dependency on.
 */
export type PlayerFixture = {
  /** The opponent's club code, as the feed and `players.club_code` spell it. */
  readonly nextOpponent: string;
  readonly atHome: boolean;
  /**
   * How hard the next game looks, as a word rather than a number or a colour.
   *
   * Three buckets and not five, because the schedule's own scores are the only
   * evidence available and they do not support finer grading than "this club
   * has been beating people". A word for the reason every signal here is a word:
   * a green-amber-red dot is undecodable to 8% of the men in this league without
   * a legend, and the Letter-Always Rule already settled that argument.
   *
   * Absent until the opponent has played three games — see `MIN_RECORD`.
   */
  readonly difficulty?: "easy" | "even" | "hard" | null;
};
