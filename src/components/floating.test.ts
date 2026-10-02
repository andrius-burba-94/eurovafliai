import { describe, expect, it } from "vitest";

import { placeFloating } from "./floating";

const screen = { width: 390, height: 844 };
const box = { width: 256, height: 60 };

describe("placeFloating", () => {
  it("opens below the anchor, from its left edge", () => {
    expect(placeFloating({ top: 100, bottom: 118, left: 20, right: 38 }, box, screen)).toEqual({ top: 124, left: 20, above: false });
  });

  it("opens above when the screen has no room below", () => {
    expect(placeFloating({ top: 800, bottom: 818, left: 20, right: 38 }, box, screen)).toEqual({ top: 734, left: 20, above: true });
  });

  it("stays below when there is no room above either", () => {
    expect(placeFloating({ top: 10, bottom: 28, left: 20, right: 38 }, box, { width: 390, height: 60 }).above).toBe(false);
  });

  it("slides left rather than running off the right edge", () => {
    expect(placeFloating({ top: 100, bottom: 118, left: 360, right: 378 }, box, screen).left).toBe(390 - 8 - 256);
  });

  it("centres on a segment when asked, and never past the left edge", () => {
    expect(placeFloating({ top: 100, bottom: 110, left: 100, right: 200 }, { width: 80, height: 24 }, screen, "center").left).toBe(110);
    expect(placeFloating({ top: 100, bottom: 110, left: 0, right: 10 }, { width: 80, height: 24 }, screen, "center").left).toBe(8);
  });
});
