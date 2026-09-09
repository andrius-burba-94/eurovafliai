import { describe, expect, it } from "vitest";

import { resolveSeason, seasonOptions } from "./season-control";

describe("resolveSeason", () => {
  it("normalizes a valid query value", () => {
    expect(resolveSeason("e2025", "E2026")).toBe("E2025");
  });

  it("uses the configured season for an invalid value", () => {
    expect(resolveSeason("2025", "E2026")).toBe("E2026");
    expect(resolveSeason(["E2025"], "E2026")).toBe("E2026");
  });
});

describe("seasonOptions", () => {
  it("offers the configured season and the preceding season", () => {
    expect(seasonOptions("E2026", "E2026")).toEqual(["E2026", "E2025"]);
  });

  it("keeps a valid historical selection available", () => {
    expect(seasonOptions("E2099", "E2026")).toEqual([
      "E2026",
      "E2025",
      "E2099",
    ]);
  });
});
