import { describe, expect, it } from "vitest";

import { feedStatus, gameStateOf, playerRoundOf, roundPointsOf, statLineOf } from "./status";

const now = Date.parse("2026-09-29T18:00:00.000Z");
const base = { final: false, connected: true, checkedAt: [] as string[], now, hasGameWindow: true, gameTimes: ["2026-09-29T17:55:00.000Z"], hasPlayedGames: false };

describe("matchday feed status", () => {
  it("calls an active window with no data unavailable", () => {
    expect(feedStatus(base).label).toContain("unavailable");
  });
  it("labels stale data rather than continuing to call it live", () => {
    expect(feedStatus({ ...base, checkedAt: ["2026-09-29T17:50:00.000Z"] })).toEqual({ label: "Live feed stale — scores may lag", alert: true });
  });
  it("shows freshness for a recent provisional snapshot", () => {
    expect(feedStatus({ ...base, checkedAt: ["2026-09-29T17:59:00.000Z"] }).label).toBe("Provisional feed updated 20:59");
  });
  it("always prefers the authoritative final state", () => {
    expect(feedStatus({ ...base, final: true, connected: false, checkedAt: ["2026-09-29T17:00:00.000Z"] })).toEqual({ label: "Final scores recorded", alert: false });
  });
  it("does not say games have not started after some have finished", () => {
    expect(feedStatus({ ...base, hasGameWindow: false, gameTimes: [], hasPlayedGames: true }).label).toContain("Some games finished");
  });
  it("says full time rather than unavailable once the live feed has stopped", () => {
    expect(feedStatus({ ...base, hasFullTime: true }).label).toBe("Full time · waiting for the official box score");
  });
});

describe("matchday game state", () => {
  const fresh = { live: true, checked_at: "2026-09-29T17:59:00.000Z" };
  it("lets the recorded result win over any snapshot", () => {
    expect(gameStateOf({ played: true, snapshot: fresh, now })).toBe("final");
  });
  it("calls a finished live snapshot full time until the result is recorded", () => {
    expect(gameStateOf({ played: false, snapshot: { ...fresh, live: false }, now })).toBe("fulltime");
  });
  it("marks a live snapshot stale after five minutes without a check", () => {
    expect(gameStateOf({ played: false, snapshot: fresh, now })).toBe("live");
    expect(gameStateOf({ played: false, snapshot: { ...fresh, checked_at: "2026-09-29T17:54:00.000Z" }, now })).toBe("stale");
  });
  it("is scheduled with no snapshot", () => {
    expect(gameStateOf({ played: false, snapshot: undefined, now })).toBe("scheduled");
  });
});

describe("a player's round", () => {
  const fixtures = [
    { game_code: 1, local_club: "ZAL", road_club: "OLY", played: true, utc_date: "2026-09-29T16:00:00.000Z" },
    { game_code: 2, local_club: "MAD", road_club: "BAR", played: false, utc_date: "2026-09-29T17:30:00.000Z" },
    { game_code: 3, local_club: "PAN", road_club: "FEN", played: false, utc_date: "2026-09-29T19:00:00.000Z" },
  ];
  const snapshots = new Map([[2, { live: true, checked_at: "2026-09-29T17:59:00.000Z" }]]);
  const of = (clubCode: string, tenths: number | null) => playerRoundOf({ clubCode, fixtures, snapshots, tenths, now });

  it("finds the game from either side and keeps the recorded points", () => {
    expect(of("OLY", 152)).toMatchObject({ state: "final", tenths: 152, fixture: { game_code: 1 } });
  });
  it("calls a game with a fresh snapshot live", () => {
    expect(of("MAD", 41)).toMatchObject({ state: "live", tenths: 41 });
  });
  it("carries the tip-off of a game still to play", () => {
    expect(of("FEN", null)).toEqual({ fixture: fixtures[2], state: "scheduled", tenths: null, tipOff: "2026-09-29T19:00:00.000Z" });
  });
  it("has no state for a club without a game", () => {
    expect(of("ASV", null)).toEqual({ fixture: null, state: null, tenths: null, tipOff: null });
  });
});

describe("a player's round points", () => {
  it("counts the role's multiplier the way the Live page does", () => {
    expect(roundPointsOf({ state: "final", tenths: 171, tipOff: null }, 2)).toEqual({ kind: "figure", text: "34.2", live: false, spoken: "34.2 points" });
    expect(roundPointsOf({ state: "final", tenths: 171, tipOff: null }, 0.5).text).toBe("8.6");
  });
  it("marks a game in play live, stale included, and reads no line yet as zero", () => {
    expect(roundPointsOf({ state: "live", tenths: 41, tipOff: null }, 1)).toMatchObject({ text: "4.1", live: true, spoken: "4.1 points, live" });
    expect(roundPointsOf({ state: "stale", tenths: null, tipOff: null }, 1)).toMatchObject({ kind: "figure", text: "0.0", live: true });
  });
  it("says full time while the official box score is pending", () => {
    expect(roundPointsOf({ state: "fulltime", tenths: -10, tipOff: null }, 1)).toMatchObject({ text: "-1.0", live: false, spoken: "-1.0 points, full time" });
  });
  it("calls a finished game without a line DNP", () => {
    expect(roundPointsOf({ state: "final", tenths: null, tipOff: null }, 1)).toMatchObject({ kind: "note", text: "DNP" });
  });
  it("shows the tip-off clock for a game still to play", () => {
    expect(roundPointsOf({ state: "scheduled", tenths: null, tipOff: "2026-09-29T17:45:00.000Z" }, 1)).toMatchObject({ kind: "note", text: "9/29 20:45", spoken: "plays on 9/29 at 20:45" });
  });
  it("says so when the club has no game", () => {
    expect(roundPointsOf({ state: null, tenths: null, tipOff: null }, 1).text).toBe("No game");
    expect(roundPointsOf(undefined, 1).text).toBe("No game");
  });
});

describe("live stat line", () => {
  it("prints the line a box score reads in", () => {
    expect(statLineOf({ points: 14, rebounds: 5, assists: 3, pir: 17, minutes: "24:10" })).toBe("14 PTS · 5 REB · 3 AST · PIR 17 · 24:10");
  });
  it("prints DNP alone", () => {
    expect(statLineOf({ points: 0, rebounds: 0, assists: 0, pir: 0, minutes: "DNP" })).toBe("DNP");
  });
});
