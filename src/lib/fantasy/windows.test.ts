import { describe, expect, it } from "vitest";

import { basketNewsDue, lineupRoundsDue, readDayAt, PREVIEW_EVERY_MS, RETRY_FAILED_MS, roundWindows, syncDue, syncModeAt } from "./windows";

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
      tips: [at("2026-10-01T16:00:00Z"), at("2026-10-02T18:30:00Z")],
      days: [at("2026-10-01T16:00:00Z"), at("2026-10-02T18:30:00Z")],
      settledAt: at("2026-10-02T21:30:00Z"),
    });
  });

  it("names each game day by its first tip-off, for two- and three-day rounds", () => {
    const [round5] = roundWindows(
      ["2026-10-13T17:45:00Z", "2026-10-13T19:00:00Z", "2026-10-14T16:00:00Z", "2026-10-14T18:45:00Z"].map((utcDate) => ({ round: 5, utcDate })),
    );
    expect(round5!.days).toEqual([at("2026-10-13T17:45:00Z"), at("2026-10-14T16:00:00Z")]);
    const [round7] = roundWindows(
      ["2026-10-21T16:00:00Z", "2026-10-22T17:30:00Z", "2026-10-22T18:45:00Z", "2026-10-23T17:00:00Z"].map((utcDate) => ({ round: 7, utcDate })),
    );
    expect(round7!.days).toEqual([at("2026-10-21T16:00:00Z"), at("2026-10-22T17:30:00Z"), at("2026-10-23T17:00:00Z")]);
  });

  it("lists each tip-off once, and not a postponed game's", () => {
    const [window] = roundWindows([
      { round: 7, utcDate: "2026-11-03T18:00:00Z" },
      { round: 7, utcDate: "2026-11-03T18:00:00Z" },
      { round: 7, utcDate: "2026-11-04T17:00:00Z" },
      { round: 7, utcDate: "2027-01-20T18:00:00Z" },
    ]);
    expect(window!.tips).toEqual([at("2026-11-03T18:00:00Z"), at("2026-11-04T17:00:00Z")]);
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
  const windows = roundWindows(fixtures);
  const preview = { mode: "preview", round: 3 } as const;
  const apply = { mode: "apply", round: 3 } as const;
  const dayOne = at("2026-10-01T16:05:00Z");
  const dayTwo = at("2026-10-02T18:35:00Z");

  const ran = (ranAt: number, status = "applied") => [{ round: 3, ranAt, status }];

  it("applies once per game day, five minutes after its first tip-off", () => {
    expect(syncDue(dayOne, apply, windows, [], null)).toBe(true);
    expect(syncDue(dayOne + 3_600_000, apply, windows, ran(dayOne), null)).toBe(false);
    expect(syncDue(at("2026-10-02T03:00:00Z"), apply, windows, ran(dayOne), null)).toBe(false);
    expect(syncDue(dayTwo - 60_000, apply, windows, ran(dayOne), null)).toBe(false);
    expect(syncDue(dayTwo, apply, windows, ran(dayOne), null)).toBe(true);
    expect(syncDue(dayTwo + 3_600_000, apply, windows, ran(dayTwo), null)).toBe(false);
  });

  it("tries a failed or blocked game-day read again after half an hour, not the next game day", () => {
    for (const status of ["failed", "blocked"]) {
      expect(syncDue(dayOne + RETRY_FAILED_MS - 60_000, apply, windows, ran(dayOne, status), null)).toBe(false);
      expect(syncDue(dayOne + RETRY_FAILED_MS, apply, windows, ran(dayOne, status), null)).toBe(true);
    }
  });

  it("previews every six hours", () => {
    const now = at("2026-10-01T09:00:00Z");
    expect(syncDue(now, preview, windows, [], now - PREVIEW_EVERY_MS + 60_000)).toBe(false);
    expect(syncDue(now, preview, windows, [], now - PREVIEW_EVERY_MS)).toBe(true);
    expect(syncDue(now, preview, windows, [], null)).toBe(true);
  });
});

describe("lineupRoundsDue", () => {
  const windows = roundWindows(fixtures);
  const now = at("2026-10-01T17:00:00Z");
  const round2SettledAt = at("2026-09-30T21:15:00Z");

  it("fills in a finished round never synced, and the frozen round, but not one still to come", () => {
    expect(lineupRoundsDue(now, windows, [])).toEqual([2, 3]);
  });

  it("does not read a round in the five minutes after its lock", () => {
    expect(lineupRoundsDue(at("2026-10-01T16:02:00Z"), windows, [])).toEqual([2]);
  });

  it("reads a frozen round once on each game day, not hourly", () => {
    const today = [{ round: 3, ranAt: at("2026-10-01T16:06:00Z"), status: "applied" }];
    expect(lineupRoundsDue(at("2026-10-01T19:00:00Z"), windows, today)).toEqual([2]);
    expect(lineupRoundsDue(at("2026-10-02T03:00:00Z"), windows, today)).toEqual([2]);
    expect(lineupRoundsDue(at("2026-10-02T18:35:00Z"), windows, today)).toEqual([2, 3]);
  });

  it("reads a finished round once more after it has settled, then leaves it", () => {
    const beforeSettled = [{ round: 2, ranAt: round2SettledAt - 60_000, status: "applied" }];
    expect(lineupRoundsDue(now, windows, beforeSettled)).toContain(2);
    const afterSettled = [...beforeSettled, { round: 2, ranAt: round2SettledAt + 60_000, status: "applied" }];
    expect(lineupRoundsDue(now, windows, afterSettled)).not.toContain(2);
  });

  it("does not read between the freeze closing and the round settling, unless forced", () => {
    const between = at("2026-10-02T20:30:00Z");
    const ran = [{ round: 3, ranAt: at("2026-10-02T18:36:00Z"), status: "applied" }];
    expect(lineupRoundsDue(between, windows, ran)).not.toContain(3);
    expect(lineupRoundsDue(between, windows, ran, true)).toContain(3);
    expect(lineupRoundsDue(at("2026-10-02T21:31:00Z"), windows, ran)).toContain(3);
  });

  it("retries a finished round whose passes since settling all failed, four times a day", () => {
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

describe("one read per game day across a real round", () => {
  // E2026 round 3 as stored on 2 October 2026: four tip-offs on day 1, six on day 2.
  const round3 = roundWindows(
    [
      "2026-10-01T16:00:00Z",
      "2026-10-01T18:00:00Z",
      "2026-10-01T18:30:00Z",
      "2026-10-01T18:45:00Z",
      "2026-10-02T17:00:00Z",
      "2026-10-02T17:45:00Z",
      "2026-10-02T18:00:00Z",
      "2026-10-02T18:00:00Z",
      "2026-10-02T18:15:00Z",
      "2026-10-02T18:30:00Z",
    ].map((utcDate) => ({ round: 3, utcDate })),
  );

  it("reads twice in the round's freeze and once after it settles, from a ten-minute clock", () => {
    const reads: string[] = [];
    const runs: { round: number; ranAt: number; status: string }[] = [];
    for (let now = at("2026-10-01T12:00:00Z"); now <= at("2026-10-03T06:00:00Z"); now += 10 * 60_000) {
      if (lineupRoundsDue(now, round3, runs).length === 0) continue;
      reads.push(new Date(now).toISOString());
      runs.push({ round: 3, ranAt: now, status: "applied" });
    }
    expect(reads).toEqual(["2026-10-01T16:10:00.000Z", "2026-10-02T17:10:00.000Z", "2026-10-02T21:30:00.000Z"]);
  });
});

describe("basketNewsDue", () => {
  const windows = roundWindows(fixtures);
  const job = (iso: string, status = "applied") => ({ round: 0, ranAt: at(iso), status });

  it("reads on each game day and after the round settles, every six hours only between rounds", () => {
    const reads: string[] = [];
    const runs = [job("2026-10-01T06:00:00Z")];
    for (let now = at("2026-10-01T06:10:00Z"); now <= at("2026-10-03T06:00:00Z"); now += 10 * 60_000) {
      if (!basketNewsDue(now, windows, runs)) continue;
      reads.push(new Date(now).toISOString());
      runs.push({ round: 0, ranAt: now, status: "applied" });
    }
    expect(reads).toEqual([
      "2026-10-01T12:00:00.000Z",
      "2026-10-01T16:10:00.000Z",
      "2026-10-02T18:40:00.000Z",
      "2026-10-02T21:30:00.000Z",
      "2026-10-03T03:30:00.000Z",
    ]);
  });

  it("retries a game day's failed job within the day", () => {
    const failed = [job("2026-10-01T16:10:00Z", "failed")];
    expect(basketNewsDue(at("2026-10-01T16:30:00Z"), windows, failed)).toBe(false);
    expect(basketNewsDue(at("2026-10-01T16:40:00Z"), windows, failed)).toBe(true);
    expect(basketNewsDue(at("2026-10-01T16:40:00Z"), windows, [...failed, job("2026-10-01T16:35:00Z", "queued")])).toBe(false);
  });

  it("reads at once when no job has ever run", () => {
    expect(basketNewsDue(at("2026-10-01T09:00:00Z"), windows, [])).toBe(true);
  });
});

describe("readDayAt", () => {
  const window = roundWindows(fixtures).find((row) => row.round === 3);

  it("names the latest game day whose first tip-off is five minutes gone", () => {
    expect(readDayAt(at("2026-10-01T15:00:00Z"), window)).toBeNull();
    expect(readDayAt(at("2026-10-01T16:05:00Z"), window)).toBe("2026-10-01");
    expect(readDayAt(at("2026-10-02T12:00:00Z"), window)).toBe("2026-10-01");
    expect(readDayAt(at("2026-10-05T12:00:00Z"), window)).toBe("2026-10-02");
    expect(readDayAt(at("2026-10-05T12:00:00Z"), undefined)).toBeNull();
  });
});
