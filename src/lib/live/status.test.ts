import { describe, expect, it } from "vitest";

import { feedStatus } from "./status";

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
});
