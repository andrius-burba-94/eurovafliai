import { describe, expect, it } from "vitest";

import { splitCsvLine } from "./split";

describe("splitCsvLine", () => {
  it("splits on commas and trims each field", () => {
    expect(splitCsvLine("a, b ,c")).toEqual(["a", "b", "c"]);
  });

  it("keeps a quoted comma inside the field — the common case for a name", () => {
    expect(splitCsvLine('"Vezenkov, Sasha",OLY,F')).toEqual([
      "Vezenkov, Sasha",
      "OLY",
      "F",
    ]);
  });

  it("reads a doubled quote inside a quoted field as one quote", () => {
    expect(splitCsvLine('"Shaquille ""Shaq"" O\'Neal",LAL')).toEqual([
      'Shaquille "Shaq" O\'Neal',
      "LAL",
    ]);
  });

  it("keeps empty fields, including a trailing one", () => {
    expect(splitCsvLine("a,,c,")).toEqual(["a", "", "c", ""]);
    expect(splitCsvLine("")).toEqual([""]);
  });

  it("does not split on a comma after an unclosed quote", () => {
    expect(splitCsvLine('"open,still open')).toEqual(["open,still open"]);
  });
});
