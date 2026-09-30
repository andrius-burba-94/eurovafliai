import { describe, expect, it } from "vitest";

import { rankByAveragePir, suggestionsFor } from "./seed";

const p = (id: string, tenths: number | null, name = id) => ({ id, name, tenths });

describe("rankByAveragePir", () => {
  it("puts the highest average first", () => {
    expect(rankByAveragePir([p("a", 80), p("b", 150), p("c", 120)]).map((x) => x.id)).toEqual([
      "b",
      "c",
      "a",
    ]);
  });

  it("breaks ties by name so the order is stable", () => {
    expect(rankByAveragePir([p("z", 100, "Zed"), p("a", 100, "Abe")]).map((x) => x.id)).toEqual([
      "a",
      "z",
    ]);
  });

  it("sorts players with no games last, by name, below a negative average", () => {
    const ranked = rankByAveragePir([p("n2", null, "Bo"), p("neg", -10), p("n1", null, "Al"), p("top", 5)]);
    expect(ranked.map((x) => x.id)).toEqual(["top", "neg", "n1", "n2"]);
  });

  it("does not mutate its input", () => {
    const input = [p("a", 1), p("b", 2)];
    rankByAveragePir(input);
    expect(input.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("suggestionsFor", () => {
  it("skips players already ranked and keeps the limit", () => {
    const pool = [p("a", 200), p("b", 190), p("c", 180), p("d", 170)];
    expect(suggestionsFor(pool, new Set(["a", "c"]), 1).map((x) => x.id)).toEqual(["b"]);
  });

  it("returns nothing when the sheet holds the whole pool", () => {
    expect(suggestionsFor([p("a", 1)], new Set(["a"]), 5)).toEqual([]);
  });
});
