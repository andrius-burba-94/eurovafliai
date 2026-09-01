import { describe, expect, it } from "vitest";

import { parseCsvRoster } from "./csv";

describe("parseCsvRoster", () => {
  it("reads the documented shape: name, club, position", () => {
    const { rows, problems } = parseCsvRoster(
      '"Valančiūnas, Jonas",ZAL,C\n"Sirvydis, Deividas",ZAL,G',
    );
    expect(problems).toEqual([]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      name: "Valančiūnas, Jonas",
      club_code: "ZAL",
      position: "C",
      source: "csv",
      person_code: null,
      status: "active",
    });
    // Diacritics survive into the display name and fold into the match key.
    expect(rows[0]?.name_normalized).toBe("jonas valanciunas");
  });

  it("accepts the optional person code and status", () => {
    const { rows } = parseCsvRoster('"Hall, Donta",BAR,F,009549,injured');
    expect(rows[0]).toMatchObject({
      person_code: "009549",
      status: "injured",
    });
  });

  it("uses a header row to find the columns, in any order", () => {
    // A hand-made sheet will not respect our column order, and it will have a
    // header. Both are cheaper to support than to explain.
    const { rows, problems } = parseCsvRoster(
      'position,Name,club\nG,"Jones, Chris",MAD',
    );
    expect(problems).toEqual([]);
    expect(rows[0]).toMatchObject({
      name: "Jones, Chris",
      club_code: "MAD",
      position: "G",
    });
  });

  it("handles quoted fields containing commas", () => {
    // The common case, since names are written "Surname, Firstname".
    const { rows } = parseCsvRoster('"Cordinier, Isaia",IST,G');
    expect(rows[0]?.name).toBe("Cordinier, Isaia");
    expect(rows[0]?.club_code).toBe("IST");
  });

  it("buckets a combined position by its first listing", () => {
    const { rows } = parseCsvRoster('"Doe, John",ZAL,G/F');
    expect(rows[0]?.position).toBe("G");
  });

  it("skips blank lines and trims whitespace", () => {
    const { rows, problems } = parseCsvRoster(
      '\n  "Doe, John" , ZAL , G  \n\n\n',
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.club_code).toBe("ZAL");
    expect(problems).toEqual([]);
  });

  it("reports a bad row by line number and keeps the rest", () => {
    // One typo in a 324-line sheet should cost that line, not the import.
    const { rows, problems } = parseCsvRoster(
      '"Good, One",ZAL,G\n"Bad, Two",ZAL,wing\n"Good, Three",ZAL,C',
    );
    expect(rows).toHaveLength(2);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toMatch(/line 2/i);
    expect(problems[0]).toMatch(/wing/);
  });

  it("reports a row with too few columns", () => {
    const { rows, problems } = parseCsvRoster('"Lonely, Name"');
    expect(rows).toEqual([]);
    expect(problems[0]).toMatch(/line 1/i);
  });

  it("refuses an unknown status rather than inventing one", () => {
    const { problems } = parseCsvRoster('"Doe, John",ZAL,G,,questionable');
    expect(problems[0]).toMatch(/questionable/);
  });

  it("returns nothing for an empty file, without complaining about it", () => {
    expect(parseCsvRoster("   \n  ")).toEqual({ rows: [], problems: [] });
  });

  it("explains an unquoted comma in a name instead of blaming the position", () => {
    // The mistake a hand-typed sheet will actually make: names are written
    // "Surname, Firstname", and an unquoted one silently becomes two columns.
    // Without this the error reads "cannot bucket ZAL as G, F or C", which
    // sends somebody looking in entirely the wrong place.
    const { rows, problems } = parseCsvRoster("Valančiūnas, Jonas,ZAL,C");
    expect(rows).toEqual([]);
    expect(problems[0]).toMatch(/line 1/i);
    expect(problems[0]).toMatch(/quote/i);
  });
});
