import { describe, expect, it } from "vitest";

import {
  LAST5,
  projectPlayer,
  projectedPointsFromRecord,
  projectedPointsOf,
  type PlayerGameLine,
} from "./project";

const line = (over: Partial<PlayerGameLine> = {}): PlayerGameLine => ({
  round: 1,
  gameCode: 1,
  timePlayed: 1200,
  fantasyTenths: 100,
  ...over,
});

describe("projectPlayer", () => {
  it("returns zeros when there are no played games", () => {
    expect(projectPlayer([])).toEqual({
      last5Fantasy: 0,
      last5Games: 0,
      seasonFantasy: 0,
      seasonGames: 0,
    });
    expect(projectPlayer([line({ timePlayed: 0, fantasyTenths: 999 })])).toEqual(
      {
        last5Fantasy: 0,
        last5Games: 0,
        seasonFantasy: 0,
        seasonGames: 0,
      },
    );
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
      line({ gameCode: 2, timePlayed: 0, fantasyTenths: 0 }),
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
      line({ gameCode: 1, fantasyTenths: -20 }),
      line({ gameCode: 2, fantasyTenths: -10 }),
    ]);
    expect(out.last5Fantasy).toBe(-15);
    expect(out.seasonFantasy).toBe(-15);
    expect(projectedPointsOf(out)).toBe(-15);
  });
});

describe("projectedPointsOf", () => {
  it("omits the field when there are no played games, even if the average column is 0", () => {
    expect(projectedPointsOf({ last5Fantasy: 0, last5Games: 0 })).toBeUndefined();
    expect(
      projectedPointsFromRecord({
        proj_last5_fantasy: 0,
        proj_last5_games: 0,
      }),
    ).toBeUndefined();
    expect(projectedPointsFromRecord({})).toBeUndefined();
  });

  it("returns a genuine zero average when the player has played", () => {
    expect(projectedPointsOf({ last5Fantasy: 0, last5Games: 3 })).toBe(0);
    expect(
      projectedPointsFromRecord({
        proj_last5_fantasy: 0,
        proj_last5_games: 3,
      }),
    ).toBe(0);
  });
});
