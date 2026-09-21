import { describe, expect, it } from "vitest";

import { splitCsvLine } from "./split";
import { toCsv, toCsvLine } from "./write";

describe("toCsvLine", () => {
  it("leaves a plain field alone", () => {
    expect(toCsvLine(["OLY", "F", 22.1])).toBe("OLY,F,22.1");
  });

  it("quotes a name with a comma in it — the common case here", () => {
    expect(toCsvLine(["Vezenkov, Sasha", "OLY"])).toBe('"Vezenkov, Sasha",OLY');
  });

  it("doubles an embedded quote", () => {
    expect(toCsvLine(['Shaquille "Shaq" O\'Neal'])).toBe(
      '"Shaquille ""Shaq"" O\'Neal"',
    );
  });

  it("quotes a field containing a newline rather than breaking the row", () => {
    expect(toCsvLine(["two\nlines"])).toBe('"two\nlines"');
  });

  it("writes null and undefined as empty fields, not as the words", () => {
    expect(toCsvLine(["a", null, undefined, "b"])).toBe("a,,,b");
  });
});

describe("toCsv", () => {
  it("writes a header, CRLF rows and a trailing newline", () => {
    expect(toCsv(["Player", "Club"], [["Nunn, Kendrick", "PAN"]])).toBe(
      'Player,Club\r\n"Nunn, Kendrick",PAN\r\n',
    );
  });

  it("writes a header-only sheet when there are no rows", () => {
    expect(toCsv(["Player"], [])).toBe("Player\r\n");
  });
});

describe("the two halves agree", () => {
  // The point of keeping the writer next to the splitter: what one writes, the
  // other reads back. `splitCsvLine` trims, so the fixtures carry no padding.
  const cases = [
    ["Vezenkov, Sasha", "OLY", "F"],
    ['a "quoted" name', "MAD", ""],
    ["plain", "", "trailing"],
  ];

  for (const fields of cases) {
    it(`round-trips ${JSON.stringify(fields)}`, () => {
      expect(splitCsvLine(toCsvLine(fields))).toEqual(fields);
    });
  }
});
