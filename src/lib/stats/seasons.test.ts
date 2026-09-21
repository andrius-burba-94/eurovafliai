import { describe, expect, it } from "vitest";

import { previousSeasonOf } from "./seasons";

describe("previousSeasonOf", () => {
  it("steps back one year, keeping the prefix", () => {
    expect(previousSeasonOf("E2026")).toBe("E2025");
    expect(previousSeasonOf("E2025")).toBe("E2024");
  });

  it("crosses a century without inventing a year", () => {
    expect(previousSeasonOf("E2100")).toBe("E2099");
    expect(previousSeasonOf("E2000")).toBe("E1999");
  });

  it("tolerates surrounding whitespace, because env values carry it", () => {
    expect(previousSeasonOf("  E2026 ")).toBe("E2025");
  });

  // Null rather than a throw: the script refuses and asks for --season=, the
  // worker shrugs and carries on enforcing pick deadlines.
  it("returns null for anything it cannot read", () => {
    expect(previousSeasonOf("")).toBeNull();
    expect(previousSeasonOf("2026")).toBeNull();
    expect(previousSeasonOf("E26")).toBeNull();
    expect(previousSeasonOf("EuroLeague")).toBeNull();
    expect(previousSeasonOf("E2026-27")).toBeNull();
  });
});
