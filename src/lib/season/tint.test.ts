import { describe, expect, it } from "vitest";

import { nightPlace, placeTint } from "./tint";

describe("a night's finish", () => {
  it("ranks a night by the teams that outscored it, sharing a place on a tie", () => {
    expect(nightPlace(90, [90, 70, 50])).toBe(1);
    expect(nightPlace(70, [90, 70, 70, 50])).toBe(2);
    expect(nightPlace(50, [90, 70, 70, 50])).toBe(4);
  });

  it("runs from gold for first to loss for last", () => {
    expect(placeTint(1, 8)).toContain("var(--color-loss) 0%");
    expect(placeTint(8, 8)).toContain("var(--color-loss) 100%");
    expect(placeTint(1, 1)).toContain("var(--color-loss) 0%");
  });
});
