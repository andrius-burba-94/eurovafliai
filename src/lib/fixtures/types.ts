/**
 * What a club has coming — the shape, ahead of the data.
 *
 * Nothing populates this yet. `fetchSeasonSchedule` reads the whole fixture
 * list, and `ingest.ts` throws the unplayed half of it away at
 * `.filter((game) => game.played)`, so today there is no honest answer to "who
 * is next". The roster surfaces already pass this through and render nothing
 * when it is absent, so landing the fixtures collection is a query change
 * rather than a second pass over the roster UI.
 *
 * It is a type-only module deliberately: a server query, a client component and
 * a page all need to agree on the shape, and a type in `src/components/` that
 * the server imports is a client module the server has taken a dependency on.
 */
export type PlayerFixture = {
  readonly nextOpponent: string;
  /** Two games in one round — the reason anybody starts a marginal player. */
  readonly doubleRound: boolean;
  /**
   * How hard the next game looks, as a word rather than a number or a colour.
   *
   * Three buckets and not five, because the schedule's own scores are the only
   * evidence available and they do not support finer grading than "this club
   * has been beating people". A word for the reason every signal here is a word:
   * a green-amber-red dot is undecodable to 8% of the men in this league without
   * a legend, and the Letter-Always Rule already settled that argument.
   *
   * Absent until 10.7 derives it, like the rest of this type.
   */
  readonly difficulty?: "easy" | "even" | "hard" | null;
};
