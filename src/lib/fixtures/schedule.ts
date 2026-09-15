/**
 * The schedule, read — slice 10.7.
 *
 * Pure, and the only place that decides what "next" and "hard draw" mean. The
 * store fetches rows and a query hands them to a page; every judgement is here,
 * where it can be tested against a made-up season rather than against whatever
 * the Euroleague is doing this week.
 *
 * The input is deliberately the shape `fetchSeasonSchedule` already returns and
 * the `fixtures` collection already stores, so nothing has to translate between
 * a feed row, a stored row and the row this module reads.
 *
 * ## There is no double round, and that is a finding rather than an omission
 *
 * The brief asked for a double-round indicator and 10.5 shipped the seam for
 * one. Measured against the live feed on 2026-09-15: in **E2025** (402 games,
 * 47 rounds) and **E2026** (380 games, 38 rounds), every one of the 804 and 760
 * club-round pairs holds **exactly one game**. A Euroleague round is one game
 * per club by construction — twenty clubs, ten games — so "two game codes for
 * one club in one round" describes something the competition cannot produce.
 *
 * The other reading, two games in one calendar week, is not a signal either:
 * 32–36% of a club's consecutive fixtures fall within four days of each other,
 * so badging it would badge a third of the season as exceptional. See
 * docs/research/euroleague-api.md.
 */
import type { PlayerFixture } from "./types";

export type ScheduleRow = {
  readonly gameCode: number;
  readonly round: number;
  readonly played: boolean;
  readonly localClub: string;
  readonly roadClub: string;
  readonly localScore: number;
  readonly roadScore: number;
  readonly utcDate: string | null;
};

/**
 * How much worse than even a game has to look before the draw is called *hard*,
 * in points.
 *
 * Four, and it is **chosen rather than derived** — the schedule cannot tell us
 * where the boundary between an even draw and a hard one belongs. What it can
 * tell us is the scale: the measured home advantage is 3.46 points a game
 * (E2025, 402 games), so a four-point expected margin is "further from even
 * than home court is worth". Named here so that reading it wrong in January is
 * one edit.
 */
const DRAW_MARGIN = 4;

/**
 * The fewest games a club must have played before its record is allowed to
 * describe it.
 *
 * Under this, `difficulty` is absent and the fixture line names the opponent and
 * stops. That is the honest shape in October: three games is already a thin
 * basis for "hard draw", and one game is a coin toss reported as a fact. There
 * is deliberately **no fallback to last season**, unlike 9.1's projections — a
 * player's PIR follows the same person across a summer, where a club's margin
 * follows a squad that has been rebuilt, and the difficulty word is a note
 * beside a fixture rather than the number autodraft ranks on.
 */
const MIN_RECORD = 3;

/** The fewest played games in a season before the home edge means anything. */
const MIN_LEAGUE_RECORD = 20;

/** Games the club is in, in schedule order. */
function gamesFor(rows: readonly ScheduleRow[], club: string): ScheduleRow[] {
  return rows.filter((row) => row.localClub === club || row.roadClub === club);
}

function opponentOf(row: ScheduleRow, club: string): string {
  return row.localClub === club ? row.roadClub : row.localClub;
}

/**
 * The league's home advantage, in points, measured from its own played games.
 *
 * Measured rather than assumed, because it is the one number here that can be:
 * every played game in the table is an observation of it. E2025 came out at
 * 3.46 across the season and 3.34 in the regular season alone, which is the
 * check that this function is reading the schedule the way it thinks it is.
 *
 * Returns 0 until twenty games have been played, so a two-game October cannot
 * announce a fourteen-point home edge.
 */
export function homeEdge(rows: readonly ScheduleRow[]): number {
  const played = rows.filter((row) => row.played);
  if (played.length < MIN_LEAGUE_RECORD) return 0;
  const total = played.reduce(
    (sum, row) => sum + (row.localScore - row.roadScore),
    0,
  );
  return total / played.length;
}

/**
 * A club's average scoring margin over its played games, or `null` when it has
 * not played enough of them to have one.
 */
export function marginFor(
  rows: readonly ScheduleRow[],
  club: string,
): number | null {
  const played = gamesFor(rows, club).filter((row) => row.played);
  if (played.length < MIN_RECORD) return null;
  const total = played.reduce((sum, row) => {
    const own = row.localClub === club ? row.localScore : row.roadScore;
    const other = row.localClub === club ? row.roadScore : row.localScore;
    return sum + (own - other);
  }, 0);
  return total / played.length;
}

/**
 * How hard one game looks, as a word — or `null` when the schedule cannot say.
 *
 * The whole calculation: the opponent's average margin, flipped (their +8 is
 * our −8), plus or minus the league's home edge depending on who is at home.
 * No strength-of-schedule adjustment and no recency weighting, because both
 * would be a more confident claim than a line on a roster block needs, and
 * neither is checkable against anything this app has.
 *
 * Note whose record is read: the **opponent's**. A fixture is hard because of
 * who is on the other side of it, not because of how the player's own club has
 * been playing — that is the player's problem in every round, not this round's
 * news.
 */
export function difficultyOf({
  rows,
  club,
  game,
}: {
  rows: readonly ScheduleRow[];
  club: string;
  game: ScheduleRow;
}): "easy" | "even" | "hard" | null {
  const margin = marginFor(rows, opponentOf(game, club));
  if (margin === null) return null;
  const atHome = game.localClub === club;
  const edge = homeEdge(rows);
  const expected = -margin + (atHome ? edge : -edge);
  if (expected <= -DRAW_MARGIN) return "hard";
  if (expected >= DRAW_MARGIN) return "easy";
  return "even";
}

/**
 * One club's fixture in a given round, or `null` when it does not play in it.
 *
 * What the lineup page wants: somebody arranging round 7 needs round 7's
 * opponent, not whatever is next by the calendar. `null` rather than a fallback
 * to the nearest round, because a club with no game in a round is exactly the
 * case the line must stay silent about.
 */
export function fixtureForRound({
  rows,
  club,
  round,
}: {
  rows: readonly ScheduleRow[];
  club: string;
  round: number;
}): PlayerFixture | null {
  const game = gamesFor(rows, club).find((row) => row.round === round);
  if (!game) return null;

  return {
    nextOpponent: opponentOf(game, club),
    atHome: game.localClub === club,
    difficulty: difficultyOf({ rows, club, game }),
  };
}

/**
 * One club's next unplayed fixture, or `null` when the season is over for it.
 *
 * What a *current* roster wants: the team page is not about a round anybody
 * named. Next is the earliest unplayed game by kickoff, falling back to round
 * and game code when the feed has not published a time yet.
 *
 * `played`, not the clock, decides what is behind us. A game that finished an
 * hour ago is still today by any date comparison, and pointing a roster at a
 * result somebody has already watched is the one wrong answer worth designing
 * against.
 */
export function nextFixture({
  rows,
  club,
}: {
  rows: readonly ScheduleRow[];
  club: string;
}): PlayerFixture | null {
  const next = gamesFor(rows, club)
    .filter((row) => !row.played)
    .sort(
      (a, b) =>
        (a.utcDate ?? "").localeCompare(b.utcDate ?? "") ||
        a.round - b.round ||
        a.gameCode - b.gameCode,
    )[0];
  if (!next) return null;

  return {
    nextOpponent: opponentOf(next, club),
    atHome: next.localClub === club,
    difficulty: difficultyOf({ rows, club, game: next }),
  };
}

/**
 * Every club's next fixture, keyed by club code.
 *
 * One pass for a whole roster: a team page holds thirteen players from up to
 * thirteen clubs, and asking the schedule club by club would read the same four
 * hundred rows thirteen times over.
 */
export function nextFixturesByClub(
  rows: readonly ScheduleRow[],
): Map<string, PlayerFixture> {
  const out = new Map<string, PlayerFixture>();
  for (const club of clubsIn(rows)) {
    const fixture = nextFixture({ rows, club });
    if (fixture) out.set(club, fixture);
  }
  return out;
}

/**
 * Every club's fixture in one round, keyed by club code. The lineup page's
 * version of the above.
 */
export function roundFixturesByClub(
  rows: readonly ScheduleRow[],
  round: number,
): Map<string, PlayerFixture> {
  const out = new Map<string, PlayerFixture>();
  for (const club of clubsIn(rows)) {
    const fixture = fixtureForRound({ rows, club, round });
    if (fixture) out.set(club, fixture);
  }
  return out;
}

function clubsIn(rows: readonly ScheduleRow[]): Set<string> {
  const clubs = new Set<string>();
  for (const row of rows) {
    clubs.add(row.localClub);
    clubs.add(row.roadClub);
  }
  return clubs;
}
