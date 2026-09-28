import { describe, expect, it } from "vitest";

import { resolveSeason, seasonOptions } from "./season-control";

describe("resolveSeason", () => {
  it("normalizes a valid fantasy season query", () => {
    expect(resolveSeason("e2027", "E2026")).toBe("E2027");
  });

  it("uses the configured season for an invalid value", () => {
    expect(resolveSeason("2025", "E2026")).toBe("E2026");
    expect(resolveSeason("E2025", "E2026")).toBe("E2026");
    expect(resolveSeason(["E2025"], "E2026")).toBe("E2026");
  });
});

describe("seasonOptions", () => {
  it("starts the fantasy season selector in E2026", () => {
    expect(seasonOptions("E2026", "E2026")).toEqual(["E2026"]);
  });

  it("keeps a valid historical selection available", () => {
    expect(seasonOptions("E2099", "E2026")).toEqual([
      "E2026",
      "E2099",
    ]);
  });
});
