import { describe, expect, it } from "vitest";

import { formatClock, formatMonthDay, formatTipOff, gameDayOf } from "./local";

describe("league-time formatting", () => {
  it("reads an instant in Vilnius time, summer and winter", () => {
    expect(formatClock("2026-09-29T17:59:00.000Z")).toBe("20:59");
    expect(formatClock("2026-12-10T18:00:00.000Z")).toBe("20:00");
  });

  it("names the day for a tip-off", () => {
    expect(formatTipOff("2026-10-01T17:30:00.000Z")).toBe("Thu 1 Oct, 20:30");
  });

  it("writes the date as month/day in league time", () => {
    expect(formatMonthDay("2026-10-01T17:30:00.000Z")).toBe("10/1");
    expect(formatMonthDay("2026-09-30T22:30:00.000Z")).toBe("10/1");
  });

  it("says nothing for a missing or unreadable instant", () => {
    expect(formatClock(undefined)).toBeNull();
    expect(formatTipOff("not a date")).toBeNull();
    expect(formatMonthDay(null)).toBeNull();
  });
});

describe("gameDayOf", () => {
  it("names the league-time calendar day a game tips off on", () => {
    expect(gameDayOf("2026-10-13T17:45:00.000Z")).toBe("2026-10-13");
    expect(gameDayOf("2026-10-13T19:00:00.000Z")).toBe("2026-10-13");
    expect(gameDayOf(Date.parse("2026-10-14T16:00:00.000Z"))).toBe("2026-10-14");
  });

  it("puts a game after midnight in Vilnius on the next day", () => {
    expect(gameDayOf("2026-12-10T22:30:00.000Z")).toBe("2026-12-11");
  });

  it("says nothing for a missing or unreadable instant", () => {
    expect(gameDayOf("")).toBeNull();
    expect(gameDayOf(undefined)).toBeNull();
  });
});
