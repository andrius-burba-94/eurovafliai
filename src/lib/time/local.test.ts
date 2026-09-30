import { describe, expect, it } from "vitest";

import { formatClock, formatTipOff } from "./local";

describe("league-time formatting", () => {
  it("reads an instant in Vilnius time, summer and winter", () => {
    expect(formatClock("2026-09-29T17:59:00.000Z")).toBe("20:59");
    expect(formatClock("2026-12-10T18:00:00.000Z")).toBe("20:00");
  });

  it("names the day for a tip-off", () => {
    expect(formatTipOff("2026-10-01T17:30:00.000Z")).toBe("Thu 1 Oct, 20:30");
  });

  it("says nothing for a missing or unreadable instant", () => {
    expect(formatClock(undefined)).toBeNull();
    expect(formatTipOff("not a date")).toBeNull();
  });
});
