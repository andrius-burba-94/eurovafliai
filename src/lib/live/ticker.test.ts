import { describe, expect, it } from "vitest";

import { newerSnapshot, tickerFixtures, tickerGame, tickerOrder, tickerSnapshotOf } from "./ticker";

// Thursday 19 November 2026, Vilnius is UTC+2.
const at = (iso: string) => Date.parse(iso);
const fixture = (code: number, utc: string, extra: Record<string, unknown> = {}) => ({
  game_code: code, local_club: "TEL", road_club: "DUB", utc_date: utc, ...extra,
});
const day = [
  fixture(122, "2026-11-19T17:15:00Z"),
  fixture(121, "2026-11-19T18:00:00Z"),
  fixture(125, "2026-11-19T20:00:00Z"),
  fixture(127, "2026-11-20T17:30:00Z"),
  fixture(120, "2026-11-18T17:00:00Z", { played: true }),
];

describe("tickerFixtures", () => {
  it("covers today's games only, in tip-off order", () => {
    expect(tickerFixtures(day, at("2026-11-19T18:30:00Z")).map((game) => game.game_code)).toEqual([122, 121, 125]);
  });

  it("opens an hour before the first tip-off and closes four hours after the last", () => {
    expect(tickerFixtures(day, at("2026-11-19T16:14:00Z"))).toEqual([]);
    expect(tickerFixtures(day, at("2026-11-19T16:15:00Z"))).toHaveLength(3);
    expect(tickerFixtures(day, at("2026-11-19T23:59:00Z"))).toHaveLength(3);
  });

  it("reads the day in league time, so a game after midnight UTC is still tonight", () => {
    const late = [fixture(200, "2026-11-19T21:30:00Z")];
    expect(tickerFixtures(late, at("2026-11-19T21:40:00Z"))).toHaveLength(1);
  });

  it("is empty on a day without games", () => {
    expect(tickerFixtures(day, at("2026-11-21T18:00:00Z"))).toEqual([]);
    expect(tickerFixtures([], at("2026-11-19T18:00:00Z"))).toEqual([]);
  });
});

describe("tickerGame", () => {
  const now = at("2026-11-19T18:30:00Z");
  const snapshot = { game_code: 122, live: true, checked_at: "2026-11-19T18:29:50Z", localScore: 47, roadScore: 38, detail: { period: 2, clock: "00:37" } };

  it("reads the live feed's score and clock while the game is on", () => {
    expect(tickerGame(day[0]!, snapshot, now)).toMatchObject({ state: "live", homeScore: 47, awayScore: 38, clock: "Q2 · 0:37" });
  });

  it("drops the clock at full time and reads the stored result once played", () => {
    expect(tickerGame(day[0]!, { ...snapshot, live: false }, now)).toMatchObject({ state: "fulltime", homeScore: 47, clock: null });
    expect(tickerGame({ ...day[0]!, played: true, local_score: 90, road_score: 81 }, snapshot, now)).toMatchObject({ state: "final", homeScore: 90, awayScore: 81 });
  });

  it("has no score before tip-off", () => {
    expect(tickerGame(day[2]!, undefined, now)).toMatchObject({ state: "scheduled", homeScore: null, clock: null });
  });
});

describe("tickerOrder", () => {
  it("puts live games first, then the ones to come, then the finished", () => {
    const now = at("2026-11-19T18:30:00Z");
    const games = [
      tickerGame({ ...day[0]!, played: true }, undefined, now),
      tickerGame(day[2]!, undefined, now),
      tickerGame(day[1]!, { game_code: 121, live: true, checked_at: "2026-11-19T18:29:00Z", localScore: 20, roadScore: 22 }, now),
    ];
    expect(tickerOrder(games).map((game) => game.code)).toEqual([121, 125, 122]);
  });
});

describe("tickerSnapshotOf and newerSnapshot", () => {
  it("keeps the score and the clock of a stored row", () => {
    expect(tickerSnapshotOf({ game_code: 1, live: true, checked_at: "x", local_score: 5, road_score: 3, detail: { period: 1, clock: "08:00" } }))
      .toEqual({ game_code: 1, live: true, checked_at: "x", localScore: 5, roadScore: 3, detail: { period: 1, clock: "08:00" } });
    expect(tickerSnapshotOf({ game_code: 1, live: true, checked_at: "x", detail: null })).toEqual({ game_code: 1, live: true, checked_at: "x", localScore: 0, roadScore: 0 });
  });

  it("prefers the later reading, whichever arrived first", () => {
    const early = { game_code: 1, live: true, checked_at: "2026-11-19T18:00:00Z", localScore: 5, roadScore: 3 };
    const late = { ...early, checked_at: "2026-11-19T18:00:20Z", localScore: 7 };
    expect(newerSnapshot(early, late)).toBe(late);
    expect(newerSnapshot(late, early)).toBe(late);
    expect(newerSnapshot(undefined, early)).toBe(early);
  });
});
