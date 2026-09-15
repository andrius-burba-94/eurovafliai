import { describe, expect, it } from "vitest";

import {
  LAST5,
  averageFantasyOf,
  averagePirOf,
  projectPlayer,
  rankPirFromRecord,
  type PlayerGameLine,
} from "./project";

const line = (over: Partial<PlayerGameLine> = {}): PlayerGameLine => ({
  round: 1,
  gameCode: 1,
  timePlayed: 1200,
  fantasyTenths: 100,
  pir: 10,
  ...over,
});

const EMPTY = {
  last5Fantasy: 0,
  last5Games: 0,
  last5Pir: 0,
  seasonFantasy: 0,
  seasonGames: 0,
  seasonPir: 0,
};

describe("projectPlayer", () => {
  it("returns zeros when there are no played games", () => {
    expect(projectPlayer([])).toEqual(EMPTY);
    expect(
      projectPlayer([line({ timePlayed: 0, fantasyTenths: 999, pir: 99 })]),
    ).toEqual(EMPTY);
  });

  it("treats last-N as last-5 when the player has fewer than five games", () => {
    const out = projectPlayer([
      line({ gameCode: 1, fantasyTenths: 100 }),
      line({ gameCode: 2, fantasyTenths: 200 }),
    ]);
    expect(out.last5Games).toBe(2);
    expect(out.last5Fantasy).toBe(150);
    expect(out.seasonGames).toBe(2);
    expect(out.seasonFantasy).toBe(150);
  });

  it("averages only the last five played games, in round then game-code order", () => {
    const out = projectPlayer([
      line({ round: 2, gameCode: 20, fantasyTenths: 50 }),
      line({ round: 1, gameCode: 2, fantasyTenths: 10 }),
      line({ round: 1, gameCode: 1, fantasyTenths: 10 }),
      line({ round: 3, gameCode: 1, fantasyTenths: 50 }),
      line({ round: 2, gameCode: 10, fantasyTenths: 50 }),
      line({ round: 4, gameCode: 1, fantasyTenths: 50 }),
    ]);
    // Chronology: r1/1, r1/2 (both 10), then four 50s. Last five are 10 + four 50s.
    expect(out.last5Games).toBe(LAST5);
    expect(out.last5Fantasy).toBe(42);
    expect(out.seasonGames).toBe(6);
    expect(out.seasonFantasy).toBe(37);
  });

  it("skips a DNP so it does not occupy a last-5 slot", () => {
    const out = projectPlayer([
      line({ gameCode: 1, fantasyTenths: 100 }),
      line({ gameCode: 2, timePlayed: 0, fantasyTenths: 0, pir: 0 }),
      line({ gameCode: 3, fantasyTenths: 200 }),
    ]);
    expect(out.last5Games).toBe(2);
    expect(out.last5Fantasy).toBe(150);
    expect(out.seasonGames).toBe(2);
  });

  it("rounds the mean of tenths to the nearest tenth", () => {
    // 11 + 11 + 12 = 34, /3 = 11.333… → 11.
    expect(
      projectPlayer([
        line({ gameCode: 1, fantasyTenths: 11 }),
        line({ gameCode: 2, fantasyTenths: 11 }),
        line({ gameCode: 3, fantasyTenths: 12 }),
      ]).seasonFantasy,
    ).toBe(11);
    // 10 + 10 + 11 = 31, /3 = 10.333… → 10.
    expect(
      projectPlayer([
        line({ gameCode: 1, fantasyTenths: 10 }),
        line({ gameCode: 2, fantasyTenths: 10 }),
        line({ gameCode: 3, fantasyTenths: 11 }),
      ]).seasonFantasy,
    ).toBe(10);
  });

  it("keeps a negative average, including on last-5", () => {
    const out = projectPlayer([
      line({ gameCode: 1, fantasyTenths: -20, pir: -2 }),
      line({ gameCode: 2, fantasyTenths: -10, pir: -1 }),
    ]);
    expect(out.last5Fantasy).toBe(-15);
    expect(out.seasonFantasy).toBe(-15);
    expect(out.last5Pir).toBe(-15);
  });

  // A stored `pir` is a whole number and its average is not, which is the whole
  // reason these columns are tenths: a PIR average rounded to an integer would
  // put half the pool on the same number.
  it("averages whole-number PIR into tenths", () => {
    const out = projectPlayer([
      line({ gameCode: 1, pir: 10 }),
      line({ gameCode: 2, pir: 11 }),
      line({ gameCode: 3, pir: 12 }),
    ]);
    expect(out.seasonPir).toBe(110);
    expect(out.last5Pir).toBe(110);

    // 10 + 11 = 21, /2 = 10.5 → 105 tenths, not 100 and not 110.
    expect(
      projectPlayer([line({ gameCode: 1, pir: 10 }), line({ gameCode: 2, pir: 11 })])
        .seasonPir,
    ).toBe(105);
  });

  it("averages PIR over its own last five, independently of fantasy", () => {
    const out = projectPlayer([
      line({ gameCode: 1, pir: 30, fantasyTenths: 330 }),
      line({ gameCode: 2, pir: 0, fantasyTenths: 0 }),
      line({ gameCode: 3, pir: 0, fantasyTenths: 0 }),
      line({ gameCode: 4, pir: 0, fantasyTenths: 0 }),
      line({ gameCode: 5, pir: 0, fantasyTenths: 0 }),
      line({ gameCode: 6, pir: 0, fantasyTenths: 0 }),
    ]);
    // The 30 falls out of the last five and stays in the season.
    expect(out.last5Pir).toBe(0);
    expect(out.seasonPir).toBe(50);
  });
});

describe("averagePirOf", () => {
  it("has nothing to say about a player with no games at all", () => {
    expect(averagePirOf({})).toBeUndefined();
    expect(rankPirFromRecord({})).toBeUndefined();
    // Unset columns read as 0, and a 0 average with 0 games is still absence.
    expect(
      averagePirOf({
        proj_last5_games: 0,
        proj_last5_pir: 0,
        prev_season_games: 0,
        prev_season_pir: 0,
      }),
    ).toBeUndefined();
  });

  it("falls back to last season when the player has no games this one", () => {
    const average = averagePirOf({
      prev_season_games: 39,
      prev_season_pir: 221,
      prev_season_code: "E2025",
    });
    expect(average).toEqual({
      tenths: 221,
      games: 39,
      source: "prev",
      season: "E2025",
    });
    // Draft night: nobody has current-season games, so this is every player.
    expect(rankPirFromRecord({ prev_season_games: 39, prev_season_pir: 221 })).toBe(
      221,
    );
  });

  it("prefers current form the moment there is any", () => {
    const average = averagePirOf({
      proj_last5_games: 1,
      proj_last5_pir: 30,
      prev_season_games: 39,
      prev_season_pir: 221,
      prev_season_code: "E2025",
    });
    // One game this season outranks a whole season of last, because the
    // question the pool answers is "how are they playing now".
    expect(average).toEqual({
      tenths: 30,
      games: 1,
      source: "last5",
      season: null,
    });
  });

  it("returns a genuine zero average when the player has played", () => {
    expect(rankPirFromRecord({ proj_last5_pir: 0, proj_last5_games: 3 })).toBe(0);
  });

  it("takes the fantasy average from the same season as the PIR one", () => {
    // Both seasons populated: the row must not print this season's PIR beside
    // last season's fantasy points.
    const record = {
      proj_last5_games: 5,
      proj_last5_pir: 100,
      proj_last5_fantasy: 110,
      prev_season_games: 39,
      prev_season_pir: 221,
      prev_season_fantasy: 243,
    };
    expect(averageFantasyOf(record)).toBe(110);
    expect(averageFantasyOf({ ...record, proj_last5_games: 0 })).toBe(243);
    expect(averageFantasyOf({})).toBeUndefined();
  });
});
