import { describe, expect, it } from "vitest";

import { feedStatus, gameStateOf, statLineOf } from "./status";

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

describe("live stat line", () => {
  it("prints the line a box score reads in", () => {
    expect(statLineOf({ points: 14, rebounds: 5, assists: 3, pir: 17, minutes: "24:10" })).toBe("14 PTS · 5 REB · 3 AST · PIR 17 · 24:10");
  });
  it("prints DNP alone", () => {
    expect(statLineOf({ points: 0, rebounds: 0, assists: 0, pir: 0, minutes: "DNP" })).toBe("DNP");
  });
});
