import { describe, expect, it } from "vitest";

import { APPLY_EVERY_MS, lineupRoundsDue, PREVIEW_EVERY_MS, roundWindows, syncDue, syncModeAt } from "./windows";

const at = (iso: string) => Date.parse(iso);

// E2026 rounds 2–4 as stored on 30 September 2026: a double-round week, then a single.
const fixtures = [
  { round: 2, utcDate: "2026-09-29T16:00:00Z" },
  { round: 2, utcDate: "2026-09-30T18:15:00Z" },
  { round: 3, utcDate: "2026-10-01T16:00:00Z" },
  { round: 3, utcDate: "2026-10-02T18:30:00Z" },
  { round: 4, utcDate: "2026-10-07T18:45:00Z" },
  { round: 4, utcDate: "2026-10-09T18:30:00Z" },
  { round: 5, utcDate: null },
];

describe("roundWindows", () => {
  const windows = roundWindows(fixtures);

  it("freezes from a round's first tip-off to ninety minutes after its last", () => {
    expect(windows.find((window) => window.round === 3)).toEqual({
      round: 3,
      lockAt: at("2026-10-01T16:00:00Z"),
      closesAt: at("2026-10-02T20:00:00Z"),
    });
  });

  it("skips a round with no tip-off times yet", () => {
    expect(windows.map((window) => window.round)).toEqual([2, 3, 4]);
  });

  it("leaves a postponed game out of its round's freeze", () => {
    const [window] = roundWindows([
      { round: 7, utcDate: "2026-11-03T18:00:00Z" },
      { round: 7, utcDate: "2026-11-04T18:00:00Z" },
      { round: 7, utcDate: "2027-01-20T18:00:00Z" },
    ]);
    expect(window!.closesAt).toBe(at("2026-11-04T19:30:00Z"));
  });
});

describe("syncModeAt", () => {
  const windows = roundWindows(fixtures);

  it("previews the next round while its rosters are still open", () => {
    expect(syncModeAt(at("2026-10-01T09:00:00Z"), windows)).toEqual({ mode: "preview", round: 3 });
  });

  it("waits five minutes after the lock before writing", () => {
    expect(syncModeAt(at("2026-10-01T16:02:00Z"), windows).mode).toBe("preview");
    expect(syncModeAt(at("2026-10-01T16:05:00Z"), windows)).toEqual({ mode: "apply", round: 3 });
  });

  it("keeps writing through the night between a round's two game days", () => {
    expect(syncModeAt(at("2026-10-02T03:00:00Z"), windows)).toEqual({ mode: "apply", round: 3 });
  });

  it("stops writing once the round's freeze has closed", () => {
    expect(syncModeAt(at("2026-10-02T20:01:00Z"), windows)).toEqual({ mode: "preview", round: 4 });
  });

  it("previews nothing after the last known round", () => {
    expect(syncModeAt(at("2026-12-01T00:00:00Z"), windows)).toEqual({ mode: "preview", round: null });
  });
});

describe("syncDue", () => {
  const now = at("2026-10-01T17:00:00Z");
  const apply = { mode: "apply", round: 3 } as const;
  const preview = { mode: "preview", round: 3 } as const;

  it("applies at once in a round that has not been applied", () => {
    expect(syncDue(now, apply, null, now - 60_000)).toBe(true);
  });

  it("applies again an hour after the last apply", () => {
    expect(syncDue(now, apply, now - APPLY_EVERY_MS + 60_000, null)).toBe(false);
    expect(syncDue(now, apply, now - APPLY_EVERY_MS, null)).toBe(true);
  });

  it("previews every six hours", () => {
    expect(syncDue(now, preview, null, now - PREVIEW_EVERY_MS + 60_000)).toBe(false);
    expect(syncDue(now, preview, null, now - PREVIEW_EVERY_MS)).toBe(true);
    expect(syncDue(now, preview, null, null)).toBe(true);
  });
});

describe("lineupRoundsDue", () => {
  const windows = roundWindows(fixtures);
  const now = at("2026-10-01T17:00:00Z");
  const round2ClosedAt = at("2026-09-30T19:45:00Z");

  it("fills in a finished round never synced, and the frozen round, but not one still to come", () => {
    expect(lineupRoundsDue(now, windows, [])).toEqual([2, 3]);
  });

  it("does not read a round in the five minutes after its lock", () => {
    expect(lineupRoundsDue(at("2026-10-01T16:02:00Z"), windows, [])).toEqual([2]);
  });

  it("reads the frozen round hourly", () => {
    const recent = [{ round: 3, ranAt: now - APPLY_EVERY_MS + 60_000, status: "applied" }];
    expect(lineupRoundsDue(now, windows, recent)).toEqual([2]);
    const hourAgo = [{ round: 3, ranAt: now - APPLY_EVERY_MS, status: "applied" }];
    expect(lineupRoundsDue(now, windows, hourAgo)).toEqual([2, 3]);
  });

  it("reads a finished round once more after its freeze closes, then leaves it", () => {
    const duringFreeze = [{ round: 2, ranAt: round2ClosedAt - 60_000, status: "applied" }];
    expect(lineupRoundsDue(now, windows, duringFreeze)).toContain(2);
    const afterClose = [...duringFreeze, { round: 2, ranAt: round2ClosedAt + 60_000, status: "applied" }];
    expect(lineupRoundsDue(now, windows, afterClose)).not.toContain(2);
  });

  it("retries a finished round whose passes since closing all failed, four times a day", () => {
    const failed = [{ round: 2, ranAt: now - PREVIEW_EVERY_MS + 60_000, status: "failed" }];
    expect(lineupRoundsDue(now, windows, failed)).not.toContain(2);
    const failedLongAgo = [{ round: 2, ranAt: now - PREVIEW_EVERY_MS, status: "blocked" }];
    expect(lineupRoundsDue(now, windows, failedLongAgo)).toContain(2);
  });

  it("on a forced pass, reads the frozen round and every unfinished one whatever just ran", () => {
    const justRan = [
      { round: 2, ranAt: now - 60_000, status: "blocked" },
      { round: 3, ranAt: now - 60_000, status: "applied" },
    ];
    expect(lineupRoundsDue(now, windows, justRan)).toEqual([]);
    expect(lineupRoundsDue(now, windows, justRan, true)).toEqual([2, 3]);
    const finished = [{ round: 2, ranAt: now - 60_000, status: "applied" }];
    expect(lineupRoundsDue(now, windows, finished, true)).toEqual([3]);
  });
});
