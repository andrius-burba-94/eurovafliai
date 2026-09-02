import { describe, expect, it } from "vitest";

import {
  AUTOPICK_GRACE_MS,
  formatRemaining,
  isPickDue,
  millisRemaining,
  needsDeadline,
  parsePbDate,
} from "./due";

const NOW = new Date("2026-09-02T19:00:00.000Z");

/** A live draft with its deadline `offsetMs` from NOW. */
function draftDue(offsetMs: number) {
  return {
    status: "live" as const,
    deadline: new Date(NOW.getTime() + offsetMs)
      .toISOString()
      .replace("T", " "),
  };
}

describe("parsePbDate", () => {
  it("reads the space-separated form PocketBase actually returns", () => {
    expect(parsePbDate("2026-09-02 19:04:05.123Z")?.toISOString()).toBe(
      "2026-09-02T19:04:05.123Z",
    );
  });

  it("reads plain ISO too, so a value written by hand still works", () => {
    expect(parsePbDate("2026-09-02T19:04:05.123Z")?.toISOString()).toBe(
      "2026-09-02T19:04:05.123Z",
    );
  });

  it("treats an unset field as no date rather than as an error", () => {
    // This is the normal shape of a paused or complete draft, not a fault.
    expect(parsePbDate("")).toBeNull();
    expect(parsePbDate("   ")).toBeNull();
    expect(parsePbDate(undefined)).toBeNull();
    expect(parsePbDate(null)).toBeNull();
  });

  it("refuses anything it cannot read", () => {
    expect(parsePbDate("soon")).toBeNull();
    expect(parsePbDate(1_759_000_000_000)).toBeNull();
  });
});

describe("millisRemaining", () => {
  it("counts down, then goes negative", () => {
    expect(millisRemaining(draftDue(30_000).deadline, NOW)).toBe(30_000);
    expect(millisRemaining(draftDue(-2_000).deadline, NOW)).toBe(-2_000);
  });

  it("is null when there is no clock to read", () => {
    expect(millisRemaining("", NOW)).toBeNull();
  });
});

describe("isPickDue", () => {
  it("is false while there is time left", () => {
    expect(isPickDue(draftDue(1_000), NOW)).toBe(false);
  });

  it("holds the grace period open for the member's own tap", () => {
    // Zero on their screen. The sweep waits before taking the turn away.
    expect(isPickDue(draftDue(0), NOW)).toBe(false);
    expect(isPickDue(draftDue(-AUTOPICK_GRACE_MS + 1), NOW)).toBe(false);
  });

  it("is due once the grace has passed too", () => {
    expect(isPickDue(draftDue(-AUTOPICK_GRACE_MS), NOW)).toBe(true);
    expect(isPickDue(draftDue(-60_000), NOW)).toBe(true);
  });

  it("takes the grace as an argument, so a test can turn it off", () => {
    expect(isPickDue(draftDue(-1), NOW, 0)).toBe(true);
  });

  it("never fires through a pause, a setup or a finished draft", () => {
    for (const status of ["paused", "setup", "complete"] as const) {
      expect(isPickDue({ ...draftDue(-60_000), status }, NOW)).toBe(false);
    }
  });

  it("does not treat a missing deadline as overdue", () => {
    // Otherwise every tick would autodraft into a draft whose clock was never
    // started. That state is `needsDeadline`'s to fix.
    expect(isPickDue({ status: "live", deadline: "" }, NOW)).toBe(false);
  });
});

describe("needsDeadline", () => {
  it("spots a live draft whose clock went missing", () => {
    expect(needsDeadline({ status: "live", deadline: "" })).toBe(true);
    expect(needsDeadline({ status: "live", deadline: "nonsense" })).toBe(true);
  });

  it("leaves a healthy draft alone", () => {
    expect(needsDeadline(draftDue(30_000))).toBe(false);
    expect(needsDeadline(draftDue(-30_000))).toBe(false);
  });

  it("leaves a paused draft alone — no clock is the point of a pause", () => {
    expect(needsDeadline({ status: "paused", deadline: "" })).toBe(false);
    expect(needsDeadline({ status: "complete", deadline: "" })).toBe(false);
  });
});

describe("formatRemaining", () => {
  it("reads as a clock", () => {
    expect(formatRemaining(60_000)).toBe("1:00");
    expect(formatRemaining(47_000)).toBe("0:47");
    expect(formatRemaining(9_000)).toBe("0:09");
    expect(formatRemaining(600_000)).toBe("10:00");
  });

  it("floors rather than rounds, so it never flatters the clock", () => {
    expect(formatRemaining(1_900)).toBe("0:01");
    expect(formatRemaining(999)).toBe("0:00");
  });

  it("stops at zero", () => {
    expect(formatRemaining(0)).toBe("0:00");
    expect(formatRemaining(-5_000)).toBe("0:00");
  });
});
