import { describe, expect, it } from "vitest";

import {
  difficultyOf,
  fixtureForRound,
  homeEdge,
  marginFor,
  nextFixture,
  nextFixturesByClub,
  roundFixturesByClub,
  type ScheduleRow,
} from "./schedule";

/**
 * Reading the schedule — slice 10.7.
 *
 * Every case here is a made-up season, on purpose: the live feed's answer changes
 * every Thursday, and what has to hold is the *reading*, not last week's result.
 * The one number checked against reality is the home edge, and that check is in
 * `docs/research/euroleague-api.md` rather than in an assertion that would go red
 * when somebody wins away from home.
 */

let nextCode = 1;

function game(over: Partial<ScheduleRow> = {}): ScheduleRow {
  return {
    gameCode: nextCode++,
    round: 1,
    played: false,
    localClub: "AAA",
    roadClub: "BBB",
    localScore: 0,
    roadScore: 0,
    utcDate: null,
    ...over,
  };
}

/** `n` played games in which `winner` beats `loser` by `by`, at `winner`'s. */
function beatings(
  winner: string,
  loser: string,
  by: number,
  n: number,
): ScheduleRow[] {
  return Array.from({ length: n }, (_, index) =>
    game({
      round: index + 1,
      played: true,
      localClub: winner,
      roadClub: loser,
      localScore: 80 + by,
      roadScore: 80,
    }),
  );
}

describe("homeEdge", () => {
  it("is nought until the season has twenty games in it", () => {
    // Otherwise a two-game October announces whatever those two games did. The
    // first week of a season is exactly when a wrong difficulty word is most
    // likely to be believed, because nobody has anything to compare it with.
    expect(homeEdge(beatings("AAA", "BBB", 14, 19))).toBe(0);
  });

  it("is the average home margin once there are enough games", () => {
    expect(homeEdge(beatings("AAA", "BBB", 6, 20))).toBe(6);
  });

  it("ignores unplayed games, which the feed reports as 0–0", () => {
    const rows = [...beatings("AAA", "BBB", 6, 20), ...Array.from({ length: 50 }, () => game())];
    expect(homeEdge(rows)).toBe(6);
  });
});

describe("marginFor", () => {
  it("is null below three games, because two is not a record", () => {
    expect(marginFor(beatings("AAA", "BBB", 10, 2), "AAA")).toBeNull();
  });

  it("counts a club's own games from both sides of the fixture", () => {
    const rows = [
      game({ played: true, localClub: "AAA", roadClub: "BBB", localScore: 90, roadScore: 80 }),
      game({ played: true, localClub: "CCC", roadClub: "AAA", localScore: 70, roadScore: 90 }),
      game({ played: true, localClub: "AAA", roadClub: "CCC", localScore: 80, roadScore: 80 }),
    ];
    // +10, +20, 0 → +10 a game. The away win has to count as +20 and not −20,
    // which is the sign error this test exists for.
    expect(marginFor(rows, "AAA")).toBe(10);
  });
});

describe("difficultyOf", () => {
  const season = (): ScheduleRow[] => [
    // A strong club and a weak one, each with a record, plus enough games for
    // the home edge to be real.
    ...beatings("STR", "WEA", 20, 10),
    ...beatings("MID", "WEA", 4, 10),
  ];

  it("reads the opponent's record, not the club's own", () => {
    const rows = season();
    const visit = game({ round: 30, localClub: "STR", roadClub: "WEA" });
    // The same game, asked from both ends: hard for the visitor, kind for the
    // home side. A function reading its own club's form would say the same word
    // twice.
    expect(difficultyOf({ rows, club: "WEA", game: visit })).toBe("hard");
    expect(difficultyOf({ rows, club: "STR", game: visit })).toBe("easy");
  });

  it("is null while the opponent has no record to describe", () => {
    const rows = [...season(), game({ round: 30, localClub: "AAA", roadClub: "NEW" })];
    const meeting = rows[rows.length - 1]!;
    expect(difficultyOf({ rows, club: "AAA", game: meeting })).toBeNull();
  });

  it("puts an evenly matched fixture between the two words", () => {
    // Two clubs a point apart, so only the home edge separates them — and the
    // home edge is smaller than the threshold, which is the whole reason the
    // threshold is bigger than it.
    const rows = [
      ...beatings("ONE", "TWO", 1, 10),
      ...beatings("TWO", "ONE", 1, 10),
    ];
    const meeting = game({ round: 30, localClub: "ONE", roadClub: "TWO" });
    expect(difficultyOf({ rows, club: "ONE", game: meeting })).toBe("even");
    expect(difficultyOf({ rows, club: "TWO", game: meeting })).toBe("even");
  });

  it("counts home court in the club's favour", () => {
    // A season in which BET is four points a game better than WOR and the home
    // side wins by three: +7 in BET's ten home games, +1 in BET's ten away
    // ones. The same pairing is then a hard draw away and an even one at home,
    // which is the reason the home edge is in the calculation at all — and the
    // reason it is measured rather than assumed.
    const rows = [
      ...Array.from({ length: 10 }, (_, index) =>
        game({ round: index + 1, played: true, localClub: "BET", roadClub: "WOR", localScore: 87, roadScore: 80 }),
      ),
      ...Array.from({ length: 10 }, (_, index) =>
        game({ round: index + 11, played: true, localClub: "WOR", roadClub: "BET", localScore: 80, roadScore: 81 }),
      ),
    ];
    expect(marginFor(rows, "BET")).toBe(4);
    expect(homeEdge(rows)).toBe(3);

    const away = game({ round: 30, localClub: "BET", roadClub: "WOR" });
    const home = game({ round: 31, localClub: "WOR", roadClub: "BET" });
    expect(difficultyOf({ rows, club: "WOR", game: away })).toBe("hard");
    expect(difficultyOf({ rows, club: "WOR", game: home })).toBe("even");
  });
});

describe("nextFixture", () => {
  it("is the earliest unplayed game by kickoff", () => {
    const rows = [
      game({ round: 3, played: true, localClub: "AAA", roadClub: "BBB", utcDate: "2026-10-01T18:00:00Z" }),
      game({ round: 5, localClub: "CCC", roadClub: "AAA", utcDate: "2026-10-15T18:00:00Z" }),
      game({ round: 4, localClub: "AAA", roadClub: "DDD", utcDate: "2026-10-08T18:00:00Z" }),
    ];
    const fixture = nextFixture({ rows, club: "AAA" });
    expect(fixture).toEqual({
      nextOpponent: "DDD",
      atHome: true,
      difficulty: null,
    });
  });

  it("does not report a game that has been played, whatever its date says", () => {
    // `played`, not the clock: a game that finished an hour ago is still today
    // by any date comparison, and pointing a roster at a result somebody has
    // already watched is the one wrong answer worth designing against.
    const rows = [
      game({ round: 1, played: true, localClub: "AAA", roadClub: "BBB", utcDate: "2099-01-01T18:00:00Z" }),
      game({ round: 2, localClub: "AAA", roadClub: "CCC", utcDate: "2026-10-08T18:00:00Z" }),
    ];
    expect(nextFixture({ rows, club: "AAA" })?.nextOpponent).toBe("CCC");
  });

  it("falls back to round and game code when the feed has published no time", () => {
    // Most of a season, at the point the draft happens.
    const rows = [
      game({ gameCode: 90, round: 9, localClub: "AAA", roadClub: "BBB" }),
      game({ gameCode: 40, round: 4, localClub: "AAA", roadClub: "CCC" }),
    ];
    expect(nextFixture({ rows, club: "AAA" })?.nextOpponent).toBe("CCC");
  });

  it("is null for a club whose season is over", () => {
    const rows = beatings("AAA", "BBB", 5, 3);
    expect(nextFixture({ rows, club: "AAA" })).toBeNull();
  });

  it("is null for a club that is not in the schedule at all", () => {
    expect(nextFixture({ rows: beatings("AAA", "BBB", 5, 3), club: "ZZZ" })).toBeNull();
  });
});

describe("fixtureForRound", () => {
  it("answers about the round asked for, not the next one", () => {
    // What a lineup page needs: somebody arranging round 7 is arranging against
    // round 7's opponent, even when rounds 5 and 6 are still unplayed.
    const rows = [
      game({ round: 5, localClub: "AAA", roadClub: "BBB" }),
      game({ round: 7, localClub: "CCC", roadClub: "AAA" }),
    ];
    expect(fixtureForRound({ rows, club: "AAA", round: 7 })).toEqual({
      nextOpponent: "CCC",
      atHome: false,
      difficulty: null,
    });
  });

  it("is null when the club does not play in the round", () => {
    const rows = [game({ round: 5, localClub: "AAA", roadClub: "BBB" })];
    expect(fixtureForRound({ rows, club: "AAA", round: 6 })).toBeNull();
  });
});

describe("the maps a page reads", () => {
  it("gives every club in the schedule its own next fixture", () => {
    const rows = [
      game({ round: 1, localClub: "AAA", roadClub: "BBB" }),
      game({ round: 1, localClub: "CCC", roadClub: "DDD" }),
    ];
    const map = nextFixturesByClub(rows);
    expect([...map.keys()].sort()).toEqual(["AAA", "BBB", "CCC", "DDD"]);
    expect(map.get("BBB")).toEqual({
      nextOpponent: "AAA",
      atHome: false,
      difficulty: null,
    });
  });

  it("leaves a finished club out of the map rather than in it as null", () => {
    // The map is a join for a roster, and `get` returning undefined is what the
    // page already treats as "no line". A null value would be a second way to
    // say the same thing.
    const rows = [
      ...beatings("OUT", "AAA", 5, 3),
      game({ round: 9, localClub: "AAA", roadClub: "BBB" }),
    ];
    expect(nextFixturesByClub(rows).has("OUT")).toBe(false);
  });

  it("keys one round's fixtures by both clubs in each game", () => {
    const rows = [
      game({ round: 4, localClub: "AAA", roadClub: "BBB" }),
      game({ round: 5, localClub: "CCC", roadClub: "DDD" }),
    ];
    const map = roundFixturesByClub(rows, 4);
    expect([...map.keys()].sort()).toEqual(["AAA", "BBB"]);
  });
});
