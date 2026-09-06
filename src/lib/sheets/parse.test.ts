import { describe, expect, it } from "vitest";

import { MAX_SHEET_LINES, parseCheatSheet } from "./parse";

/**
 * The four shapes a pasted cheat sheet actually arrives in, and the one that
 * breaks naive parsers: names in this pool are "Surname, Firstname", so an
 * unquoted name is two CSV fields.
 */
describe("parseCheatSheet", () => {
  it("reads a bare list of names, ranked by where they sit", () => {
    const { rows, problems } = parseCheatSheet("Nunn\nSloukas\nMirotic\n");
    expect(problems).toEqual([]);
    expect(rows.map((row) => row.name)).toEqual(["Nunn", "Sloukas", "Mirotic"]);
    expect(rows.map((row) => row.rank)).toEqual([null, null, null]);
    expect(rows.map((row) => row.lineNo)).toEqual([1, 2, 3]);
  });

  it("reads rank and name", () => {
    const { rows } = parseCheatSheet("1,Nunn\n2,Sloukas");
    expect(rows).toEqual([
      { lineNo: 1, rank: 1, tier: "", name: "Nunn" },
      { lineNo: 2, rank: 2, tier: "", name: "Sloukas" },
    ]);
  });

  it("tolerates spaces after the commas, which the UI now tells people to use", () => {
    // `rank, tier, name` is what the paste box says, so it has to parse. Every
    // field is trimmed by the shared splitter, so it does — asserted because
    // the copy is a promise.
    const { rows, problems } = parseCheatSheet("1, 1, Nunn\n2, 2, Sloukas");
    expect(problems).toEqual([]);
    expect(rows).toEqual([
      { lineNo: 1, rank: 1, tier: "1", name: "Nunn" },
      { lineNo: 2, rank: 2, tier: "2", name: "Sloukas" },
    ]);
  });

  it("reads rank, tier and name", () => {
    const { rows } = parseCheatSheet("1,1,Nunn\n2,1,Sloukas\n3,2,Mirotic");
    expect(rows.map((row) => row.tier)).toEqual(["1", "1", "2"]);
    expect(rows.map((row) => row.name)).toEqual(["Nunn", "Sloukas", "Mirotic"]);
  });

  it("keeps a quoted surname-comma-forename whole", () => {
    const { rows } = parseCheatSheet('1,2,"Valančiūnas, Jonas"');
    expect(rows[0]?.name).toBe("Valančiūnas, Jonas");
    expect(rows[0]?.tier).toBe("2");
  });

  it("rejoins an UNquoted surname-comma-forename, which is the common paste", () => {
    // Three fields where two were expected. Any column-counting parser reads
    // "Jonas" as a third column; leading numbers are claimed and the rest is
    // the name.
    const { rows, problems } = parseCheatSheet("1,2,Valančiūnas, Jonas");
    expect(problems).toEqual([]);
    expect(rows[0]).toEqual({
      lineNo: 1,
      rank: 1,
      tier: "2",
      name: "Valančiūnas, Jonas",
    });
  });

  it("rejoins an unquoted name with no rank at all", () => {
    const { rows } = parseCheatSheet("Valančiūnas, Jonas\nNunn, Kendrick");
    expect(rows.map((row) => row.name)).toEqual([
      "Valančiūnas, Jonas",
      "Nunn, Kendrick",
    ]);
  });

  it("does not read a second number as a tier when nothing follows it", () => {
    // "1,2" is a rank and a name of "2" — there is no third column to be the
    // player, so claiming the 2 as a tier would leave the line nameless.
    const { rows } = parseCheatSheet("1,2");
    expect(rows[0]).toEqual({ lineNo: 1, rank: 1, tier: "", name: "2" });
  });

  it("honours a header row, in any column order", () => {
    const { rows } = parseCheatSheet(
      "Player Name,Tier,Rank\nNunn,A,2\nSloukas,B,1",
    );
    // Every row is numbered, so the ranks are obeyed over the line order.
    expect(rows.map((row) => row.name)).toEqual(["Sloukas", "Nunn"]);
    expect(rows.map((row) => row.tier)).toEqual(["B", "A"]);
  });

  it("takes a header'd tier column verbatim — a tier is a label, not a number", () => {
    const { rows } = parseCheatSheet(
      "rank,tier,name\n1,elite,Nunn\n2,elite,Sloukas",
    );
    expect(rows.map((row) => row.tier)).toEqual(["elite", "elite"]);
  });

  it("obeys the rank column only when every row has one", () => {
    // Half-numbered is a sheet somebody hand-edited. Re-sorting by the numbers
    // that survived would move rows they never touched.
    const { rows } = parseCheatSheet("3,Nunn\nSloukas\n1,Mirotic");
    expect(rows.map((row) => row.name)).toEqual(["Nunn", "Sloukas", "Mirotic"]);
  });

  it("sorts by rank when the whole sheet is numbered, and keeps duplicates stable", () => {
    const { rows } = parseCheatSheet("3,Mirotic\n1,Nunn\n1,Sloukas");
    expect(rows.map((row) => row.name)).toEqual(["Nunn", "Sloukas", "Mirotic"]);
  });

  it("skips blank lines rather than reporting them", () => {
    const { rows, problems } = parseCheatSheet("Nunn\n\n   \nSloukas\n");
    expect(problems).toEqual([]);
    expect(rows.map((row) => row.lineNo)).toEqual([1, 4]);
  });

  it("reports a line with a rank and no player", () => {
    const { rows, problems } = parseCheatSheet("1,Nunn\n2,\n3,Sloukas");
    expect(rows).toHaveLength(2);
    expect(problems).toEqual(["Line 2: no player name on this line."]);
  });

  it("stops at the cap and says so", () => {
    const text = Array.from(
      { length: MAX_SHEET_LINES + 5 },
      (_, i) => `p${i}`,
    ).join("\n");
    const { rows, problems } = parseCheatSheet(text);
    expect(rows).toHaveLength(MAX_SHEET_LINES);
    expect(problems[0]).toContain(`capped at ${MAX_SHEET_LINES}`);
  });

  it("reads an empty paste as an empty sheet, not as a problem", () => {
    expect(parseCheatSheet("")).toEqual({ rows: [], problems: [] });
  });
});
