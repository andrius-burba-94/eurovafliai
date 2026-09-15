import { describe, expect, it } from "vitest";

import {
  SPARK_HEIGHT,
  SPARK_WIDTH,
  sparklinePoints,
  sparklineSentence,
} from "./sparkline";

/**
 * The marks are `aria-hidden`, so the sentence is the whole content for a
 * screen-reader user — which is why it is tested harder than the geometry.
 * `rowSentence` in the radar shipped three defects in one untested string; this
 * is the same class of code.
 */

function pairs(points: string): [number, number][] {
  return points
    .split(" ")
    .map((pair) => pair.split(",").map(Number) as [number, number]);
}

describe("sparklinePoints", () => {
  it("refuses to draw a line through fewer than two games", () => {
    // One game is a dot. Drawn in a box that means "recent form", a single mark
    // reads as a flat trend rather than as an absence of one.
    expect(sparklinePoints([])).toBeNull();
    expect(sparklinePoints([14])).toBeNull();
  });

  it("spans the full width and stays inside the box", () => {
    const points = pairs(sparklinePoints([4, 18, 9, 22, 11])!);
    expect(points).toHaveLength(5);
    expect(points[0]![0]).toBe(0);
    expect(points[4]![0]).toBe(SPARK_WIDTH);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(SPARK_WIDTH);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(SPARK_HEIGHT);
    }
  });

  it("draws bigger numbers higher, because SVG's y grows downward", () => {
    // The easiest bug in a hand-rolled chart, and invisible in a screenshot
    // unless you already know which way the player was trending.
    const [low, high] = pairs(sparklinePoints([2, 30])!);
    expect(high![1]).toBeLessThan(low![1]);
  });

  it("draws a steady run down the middle, not along the floor", () => {
    // A flat series has no range to normalize against. Pinning it at the bottom
    // would draw five identical 14-PIR games as the worst possible form.
    const points = pairs(sparklinePoints([14, 14, 14])!);
    for (const [, y] of points) expect(y).toBe(SPARK_HEIGHT / 2);
  });

  it("handles a negative game without leaving the box", () => {
    // PIR goes negative — a player can foul out having done nothing else.
    const points = pairs(sparklinePoints([-4, 12, 6])!);
    for (const [, y] of points) {
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(SPARK_HEIGHT);
    }
    expect(points[0]![1]).toBeGreaterThan(points[1]![1]);
  });

  it("emits no negative zero", () => {
    // `-0` in a points attribute is valid SVG and a noisy diff forever after.
    expect(sparklinePoints([5, 9])).not.toContain("-0");
  });
});

describe("sparklineSentence", () => {
  it("says the numbers before it says the reading", () => {
    const said = sparklineSentence([4, 9, 22], "PIR");
    expect(said).toBe("Last 3 games, oldest first: 4, 9, 22 PIR — trending up.");
  });

  it("reads a decline as a decline", () => {
    expect(sparklineSentence([22, 9, 4], "PIR")).toContain("trending down");
  });

  it("calls an unchanged run level rather than inventing a direction", () => {
    expect(sparklineSentence([9, 15, 9], "PIR")).toContain("level");
  });

  it("says something useful for the counts that draw nothing", () => {
    // These two never reach a `<polyline>`, but the sentence can still be
    // rendered beside an absent picture, so it must not read as a bug.
    expect(sparklineSentence([], "PIR")).toBe("No PIR yet.");
    expect(sparklineSentence([13], "PIR")).toBe("One game: 13 PIR.");
  });
});
