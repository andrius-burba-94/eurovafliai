import { describe, expect, it } from "vitest";

import pool from "@/lib/fantasy/fixtures/pool.json";

import { CLUB_COLORS, clubColor } from "./colors";

const clubsInPool = [
  ...new Set((pool as readonly { club_code?: string }[]).map((row) => row.club_code).filter((code): code is string => Boolean(code))),
];

describe("club colours", () => {
  it("has a colour for every club in the season's pool", () => {
    expect(clubsInPool.length).toBe(20);
    for (const code of clubsInPool) expect(CLUB_COLORS[code], code).toBeDefined();
  });

  it("keeps every colour light enough for the dark ground and dark enough for the light one", () => {
    for (const [code, value] of Object.entries(CLUB_COLORS)) {
      const lightness = Number(/oklch\(([\d.]+)/.exec(value)?.[1]);
      expect(lightness, code).toBeGreaterThanOrEqual(0.46);
      expect(lightness, code).toBeLessThanOrEqual(0.86);
    }
  });

  it("falls back to quiet ink for a club it does not know", () => {
    expect(clubColor("zal")).toBe(CLUB_COLORS.ZAL);
    expect(clubColor("XYZ")).toBe("var(--color-ink-soft)");
    expect(clubColor(null)).toBe("var(--color-ink-soft)");
  });
});
