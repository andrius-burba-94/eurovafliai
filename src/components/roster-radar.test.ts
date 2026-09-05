import { describe, expect, it } from "vitest";

import { rowSentence } from "./roster-radar";
import { buildRadar, type RadarPick, type RosterTemplate } from "@/lib/engine";

/**
 * What the radar says out loud.
 *
 * The marks are `aria-hidden`, so this sentence is the *entire* content of a
 * radar row for a screen-reader user — and it was the one part of this
 * component with no test. The overflow branch was therefore shipped reading
 * "needs nothing — the roster is full, and 1 pick that do not fit the roster
 * template": a singular noun with a plural verb, the surplus grafted onto
 * *needs* so the member appeared to need the illegal pick, and an em-dash aside
 * left open. Three defects in one untested string.
 */

const TEMPLATE: RosterTemplate = { G: 5, F: 5, C: 3 };
const you = { memberId: "m1", name: "B Ballers", isYou: false };
const mine = { memberId: "m1", name: "Chief", isYou: true };

const pick = (position: "G" | "F" | "C", overallNo: number): RadarPick => ({
  overallNo,
  playerId: `p${overallNo}`,
  position,
});

const say = (picks: RadarPick[], column = you) => {
  const row = buildRadar([{ memberId: "m1", picks }], TEMPLATE)[0]!;
  return rowSentence(row, column, 13);
};

describe("rowSentence", () => {
  it("names the member, the count and every need", () => {
    expect(say([])).toBe(
      "B Ballers: 0 of 13 filled, needs 5 guards, 5 forwards and 3 centers.",
    );
  });

  it("says which member is you", () => {
    expect(say([], mine)).toContain("Chief, you: 0 of 13 filled");
  });

  it("drops a bucket from the list once it is full", () => {
    expect(say([pick("C", 1), pick("C", 2), pick("C", 3)])).toBe(
      "B Ballers: 3 of 13 filled, needs 5 guards and 5 forwards.",
    );
  });

  it("uses the singular for a need of one", () => {
    const picks = [
      ...Array.from({ length: 5 }, (_, i) => pick("G", i + 1)),
      ...Array.from({ length: 5 }, (_, i) => pick("F", i + 6)),
      pick("C", 11),
      pick("C", 12),
    ];
    expect(say(picks)).toBe("B Ballers: 12 of 13 filled, needs 1 center.");
  });

  it("says a full roster needs nothing, as its own finished sentence", () => {
    const picks = [
      ...Array.from({ length: 5 }, (_, i) => pick("G", i + 1)),
      ...Array.from({ length: 5 }, (_, i) => pick("F", i + 6)),
      ...Array.from({ length: 3 }, (_, i) => pick("C", i + 11)),
    ];
    expect(say(picks)).toBe("B Ballers: 13 of 13 filled, needs nothing.");
  });
});

describe("rowSentence — the clock", () => {
  it("says when a member is on the clock", () => {
    const row = buildRadar([{ memberId: "m1", picks: [] }], TEMPLATE)[0]!;
    expect(rowSentence(row, mine, 13, true)).toBe(
      "Chief, you, on the clock: 0 of 13 filled, needs 5 guards, 5 forwards and 3 centers.",
    );
    expect(rowSentence(row, you, 13, true)).toContain(
      "B Ballers, on the clock:",
    );
  });

  it("says nothing about the clock when nobody is on it", () => {
    const row = buildRadar([{ memberId: "m1", picks: [] }], TEMPLATE)[0]!;
    expect(rowSentence(row, you, 13, false)).not.toContain("on the clock");
  });
});

describe("rowSentence — the surplus that should never exist", () => {
  it("reports it as its own sentence, with the verb agreeing", () => {
    // Not "needs nothing, and 1 pick that do not fit": a member does not *need*
    // the pick that broke their roster.
    const picks = [
      ...Array.from({ length: 5 }, (_, i) => pick("G", i + 1)),
      ...Array.from({ length: 5 }, (_, i) => pick("F", i + 6)),
      ...Array.from({ length: 4 }, (_, i) => pick("C", i + 11)),
    ];
    expect(say(picks)).toBe(
      "B Ballers: 13 of 13 filled, needs nothing. 1 pick does not fit the roster template.",
    );
  });

  it("pluralizes the verb with the noun", () => {
    const picks = [...Array.from({ length: 5 }, (_, i) => pick("C", i + 1))];
    expect(say(picks)).toContain("2 picks do not fit the roster template.");
  });

  it("keeps the needs sentence intact when both are true", () => {
    // A surplus at center while guards are still open: the two facts must not
    // run into one another.
    const picks = [pick("C", 1), pick("C", 2), pick("C", 3), pick("C", 4)];
    expect(say(picks)).toBe(
      "B Ballers: 3 of 13 filled, needs 5 guards and 5 forwards. 1 pick does not fit the roster template.",
    );
  });
});
