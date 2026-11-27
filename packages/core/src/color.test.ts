import { describe, expect, it } from "vitest";

import { oklchToLinearRgb } from "./color";

const close = (actual: number[], expected: number[]) =>
  actual.forEach((value, i) => expect(value).toBeCloseTo(expected[i]!, 3));

describe("oklchToLinearRgb", () => {
  it("maps white and black to the ends of sRGB", () => {
    close(oklchToLinearRgb([1, 0, 0]), [1, 1, 1]);
    close(oklchToLinearRgb([0, 0, 0]), [0, 0, 0]);
  });

  it("lands sRGB's primaries where the Oklab spec puts them", () => {
    close(oklchToLinearRgb([0.627955, 0.257683, 29.2339]), [1, 0, 0]);
    close(oklchToLinearRgb([0.86644, 0.294827, 142.4953]), [0, 1, 0]);
    close(oklchToLinearRgb([0.452014, 0.313214, 264.052]), [0, 0, 1]);
  });

  it("clamps a colour outside sRGB instead of returning an unrenderable channel", () => {
    for (const channel of oklchToLinearRgb([0.7, 0.4, 150])) {
      expect(channel).toBeGreaterThanOrEqual(0);
      expect(channel).toBeLessThanOrEqual(1);
    }
  });
});
