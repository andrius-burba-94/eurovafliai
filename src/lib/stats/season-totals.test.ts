import { describe, expect, it } from "vitest";

import {
  SEASON_TOTALS_PARAMS,
  perGameTenths,
  seasonAveragesFrom,
  seasonTotalsUrl,
  storedStatsOf,
} from "./season-totals";

/** One row in the feed's own shape, trimmed to the fields we read. */
const row = (over: Record<string, unknown> = {}) => ({
  player: { code: "P001", name: "DOE, JOHN", team: { code: "ZAL" } },
  gamesPlayed: 10,
  pir: 100,
  pointsScored: 120,
  totalRebounds: 50,
  assists: 30,
  minutesPlayed: 250,
  twoPointersPercentage: "54.5%",
  threePointersPercentage: "34.4%",
  freeThrowsPercentage: "80.0%",
  ...over,
});

describe("seasonTotalsUrl", () => {
  // The two parameters that decide *which* numbers come back. Without
  // `seasonMode=Single` the endpoint ignores `seasonCode` entirely and answers
  // all-time career leaders — 642 rows including retired players, no error,
  // nothing that looks wrong. Without `statisticMode=accumulated` it applies a
  // minimum-games qualification and drops 127 of 335 players, which is exactly
  // the fringe and mid-season arrivals a draft has to price.
  it("carries the two parameters that stop it answering a different question", () => {
    const url = new URL(seasonTotalsUrl("E2025"));
    expect(url.searchParams.get("seasonCode")).toBe("E2025");
    expect(url.searchParams.get("seasonMode")).toBe("Single");
    expect(url.searchParams.get("statisticMode")).toBe("accumulated");
    expect(SEASON_TOTALS_PARAMS.statisticMode).not.toBe("perGame");
  });

  // The only v3 resource on a v2 API. v1, v2 and v4 all answer
  // `UnsupportedApiVersion` on this path.
  it("asks v3, and the whole list in one request", () => {
    const url = new URL(seasonTotalsUrl("E2025"));
    expect(url.pathname).toContain("/v3/");
    expect(url.searchParams.get("limit")).toBe("1000");
  });
});

describe("perGameTenths", () => {
  it("divides a season total into tenths", () => {
    expect(perGameTenths(100, 10)).toBe(100);
    // 221 over 39 is 5.666… → 56.7 in tenths, which is what the site prints.
    expect(perGameTenths(221, 39)).toBe(57);
  });

  it("is zero games rather than a division by zero", () => {
    expect(perGameTenths(0, 0)).toBe(0);
    expect(perGameTenths(50, 0)).toBe(0);
  });

  // PIR goes negative, and `Math.round` breaks ties towards +Infinity, so a
  // naive round would make −0.25 and 0.25 round in the same direction.
  it("rounds a negative average away from zero", () => {
    expect(perGameTenths(-1, 4)).toBe(-3);
    expect(perGameTenths(1, 4)).toBe(3);
  });
});

describe("seasonAveragesFrom", () => {
  it("turns totals into per-game averages in tenths", () => {
    const [average] = seasonAveragesFrom({ total: 1, players: [row()] });
    expect(average).toMatchObject({
      personCode: "P001",
      games: 10,
      pir: 100,
      points: 120,
      rebounds: 50,
      assists: 30,
    });
    expect(storedStatsOf(average!).threePointPct).toBe("34.4%");
  });

  // Box scores and the pool both join on the person code. Name-matching here
  // would be a second, worse copy of 4.2's matcher, and the failure mode is a
  // season of somebody else's work on a player's row.
  it("drops a row with no person code rather than matching it by name", () => {
    expect(
      seasonAveragesFrom({
        players: [row({ player: { code: null, name: "DOE, JOHN" } })],
      }),
    ).toEqual([]);
  });

  it("drops a row with no games, which carries no average to import", () => {
    expect(seasonAveragesFrom({ players: [row({ gamesPlayed: 0 })] })).toEqual([]);
  });

  // The current season answers `total: 0` until its first game is played. Not
  // an error, and the caller reports it rather than retrying.
  it("reads an empty season as an empty list", () => {
    expect(seasonAveragesFrom({ total: 0, players: [] })).toEqual([]);
    expect(seasonAveragesFrom({ total: 0 })).toEqual([]);
  });

  // Nine E2025 rows read `team.code` as `PAO;PES` for a player who moved
  // mid-season. We never match on it; this is here so that stays true.
  it("survives a semicolon-joined team code", () => {
    const [average] = seasonAveragesFrom({
      players: [row({ player: { code: "P002", name: "MOVED, MID", team: { code: "PAO;PES" } } })],
    });
    expect(average?.personCode).toBe("P002");
  });

  it("keeps a negative PIR total negative", () => {
    const [average] = seasonAveragesFrom({
      players: [row({ pir: -8, gamesPlayed: 4 })],
    });
    expect(average?.pir).toBe(-20);
  });
});
