import { describe, expect, it } from "vitest";

import { numbersIn } from "./facts";
import { checkWriteup, type GuardContext } from "./guard";

const sheet = "@T1 night 214.6 rank 1\n@T2 night 206.5 rank 2\n#P1 PIR 31 counted 68.2\nround 4";

const context: GuardContext = {
  allowed: new Set(numbersIn(sheet)),
  tokens: new Set(["@T1", "@T2", "#P1"]),
  privateNames: ["Einikio Kabliai", "Vafliai", "Valanciunas", "Jonas Valanciunas", "Ed"],
};

function violations(...lines: string[]) {
  return checkWriteup(lines, context).violations;
}

describe("checkWriteup", () => {
  it("passes prose that cites only tokens and numbers from the facts", () => {
    expect(violations("@T1 won round 4 with 214.6 fantasy points.", "#P1 put up 31 PIR for @T1's 68.2.")).toEqual([]);
  });

  it("accepts counting words up to ten and small digits that need no citing", () => {
    expect(violations("@T2 is 2 places back after three rounds of first-place finishes.")).toEqual([]);
  });

  it("refuses a number the facts do not contain", () => {
    expect(violations("@T1 won by 9.1.")).toEqual(["line 1: 9.1 is not in the facts"]);
  });

  it("refuses a token the facts never issued", () => {
    expect(violations("@T3 collapsed.")).toEqual(["line 1: @T3 is not in the facts"]);
  });

  it("refuses a malformed or glued token", () => {
    expect(violations("@t1 won.")).toEqual(['line 1: "@t1" is not a token; write tokens exactly, like @T1 or #P1']);
    expect(violations("@T1s won.")).toEqual(['line 1: "@T1s" is not a token; write tokens exactly, like @T1 or #P1']);
  });

  it("refuses a token that lost its sigil", () => {
    expect(violations("T1 won.")).toEqual(["line 1: a token is missing its @ or #"]);
  });

  it("refuses an article before a token, since the name decides a or an", () => {
    expect(violations("It was a #P1 masterclass.")).toEqual(['line 1: no "a" or "an" before a token']);
  });

  it("refuses markdown, links and addresses", () => {
    expect(violations("**@T1** won.")).toEqual(["line 1: plain text only, no markdown"]);
    expect(violations("- @T1 won.")).toEqual(["line 1: plain text only, no markdown"]);
    expect(violations("See https://x.test for @T1.")).toEqual(["line 1: no links or addresses"]);
  });

  it("asks for digits instead of big numbers in words", () => {
    expect(violations("@T1 scored over two hundred.")).toEqual(["line 1: write numbers as digits"]);
  });

  it("refuses a spelled-out private name, whole words only", () => {
    expect(violations("Vafliai won.")).toEqual(["line 1: wrote a name instead of its token"]);
    expect(violations("Valanciunas was huge for @T1.")).toEqual(["line 1: wrote a name instead of its token"]);
    // A four-letter-or-shorter name is skipped, and a name inside a word is not a name.
    expect(violations("Edges were thin for @T1.")).toEqual([]);
  });

  it("refuses a line break inside a line", () => {
    expect(violations("@T1 won.\n@T2 did not.")).toEqual(["line 1: one line per entry, no line breaks"]);
  });

  it("warns, without refusing, when a cited number belongs to another token", () => {
    const withLines: GuardContext = {
      ...context,
      numbersByToken: new Map([
        ["@T1", new Set([21460, 100])],
        ["@T2", new Set([20650, 200])],
        ["#P1", new Set([3100, 6820])],
      ]),
      sharedNumbers: new Set([400]),
    };
    const result = checkWriteup(["@T2 scored 214.6 in round 4."], withLines);
    expect(result.violations).toEqual([]);
    expect(result.warnings).toEqual(["line 1: 214.6 is in the facts but not on @T2's lines"]);
  });
});
