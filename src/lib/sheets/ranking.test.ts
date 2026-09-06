import { describe, expect, it } from "vitest";

import { matchSheet, resolveSheet, type MatchablePlayer } from "./match";
import { parseCheatSheet } from "./parse";
import { sheetToText, tierOfRank } from "./ranking";

/**
 * Writing a sheet back out, and reading it in again.
 *
 * The paste box is seeded with this, so it is the half of the round trip that
 * makes whole-replace safe. It is tested *as* a round trip rather than against
 * a fixed string: the property is that reading back what we wrote returns the
 * same ranking and the same breaks, not that the punctuation matches a literal.
 */

const player = (id: string, name: string, club = "ZAL") =>
  ({
    id,
    name,
    normalized: name
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, " ")
      .trim()
      .split(/\s+/)
      .sort()
      .join(" "),
    club,
    position: "G",
  }) as MatchablePlayer;

const POOL: MatchablePlayer[] = [
  player("p1", "Valanciunas, Jonas"),
  player("p2", "Nunn"),
  player("p3", 'Quote "Nickname" Player'),
  player("p4", "Ayayi, Joel, Jean Michel"),
];

/** rank/tier/name rows, the shape `getCheatSheetView` builds. */
const rowsFor = (ranking: string[], tiers: number[]) =>
  ranking.map((id, index) => ({
    rank: index + 1,
    tier: tierOfRank(index + 1, tiers),
    name: POOL.find((one) => one.id === id)!.name,
  }));

const readBack = (text: string) =>
  resolveSheet(matchSheet(parseCheatSheet(text).rows, POOL));

describe("sheetToText", () => {
  it("writes the format the paste box documents, spaces and all", () => {
    // The box says `rank, tier, name`; a surface that instructs one format and
    // emits another teaches the wrong thing. This was `5,2,"Name"`.
    expect(sheetToText(rowsFor(["p2"], []))).toBe("1, 1, Nunn");
  });

  it("quotes a name only when it needs it", () => {
    const text = sheetToText(rowsFor(["p2", "p1"], []));
    expect(text).toContain("1, 1, Nunn");
    expect(text).toContain('2, 1, "Valanciunas, Jonas"');
  });

  it("doubles an embedded quote, which the splitter unescapes", () => {
    const text = sheetToText(rowsFor(["p3"], []));
    expect(text).toBe('1, 1, "Quote ""Nickname"" Player"');
    expect(readBack(text).ranking).toEqual(["p3"]);
  });

  it("round-trips a ranking with no tier breaks", () => {
    const ranking = ["p2", "p1", "p4"];
    const text = sheetToText(rowsFor(ranking, []));
    expect(readBack(text)).toEqual({ ranking, tiers: [] });
  });

  it("round-trips the tier breaks, which is the whole point", () => {
    const ranking = ["p2", "p1", "p4"];
    const tiers = [1];
    const text = sheetToText(rowsFor(ranking, tiers));
    expect(readBack(text)).toEqual({ ranking, tiers });
  });

  it("round-trips a name that is itself full of commas", () => {
    // "Ayayi, Joel, Jean Michel" is four CSV fields unquoted. If the writer
    // forgot to quote it, the reader would drop three quarters of the name.
    const text = sheetToText(rowsFor(["p4"], []));
    expect(readBack(text).ranking).toEqual(["p4"]);
  });

  it("writes nothing for an empty sheet, rather than a blank line", () => {
    expect(sheetToText([])).toBe("");
    expect(readBack("")).toEqual({ ranking: [], tiers: [] });
  });
});
