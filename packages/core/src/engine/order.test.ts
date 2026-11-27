import { describe, expect, it } from "vitest";

import { buildPickOrder, memberAt, roundAndSlot } from "./order";
import type { DraftFormat } from "./types";

/**
 * §5 of the draft-engine invariants: every format, odd AND even member counts,
 * the minimum (2) and the maximum (12), the full 13 rounds — not just the first
 * three — and the round boundaries where direction flips.
 *
 * Short letter ids on purpose: an expected order written as "ABCCBA" is
 * readable, and a wrong reversal is visible at a glance rather than buried in
 * uuid noise.
 */

const members = (n: number): string[] =>
  Array.from({ length: n }, (_, i) => String.fromCharCode(65 + i));

/** The sequence as a compact string, one character per pick. */
const asText = (sequence: readonly string[]): string => sequence.join("");

/** One round out of a sequence, 1-based. */
const round = (sequence: readonly string[], n: number, memberCount: number): string =>
  asText(sequence.slice((n - 1) * memberCount, n * memberCount));

const ROUNDS = 13;
const FORMATS: DraftFormat[] = ["linear", "snake", "snake3rr"];

describe("buildPickOrder — shape", () => {
  it.each(FORMATS)("%s produces members × rounds picks", (format) => {
    for (const count of [2, 3, 8, 11, 12]) {
      const sequence = buildPickOrder(format, members(count), ROUNDS);
      expect(sequence).toHaveLength(count * ROUNDS);
    }
  });

  it.each(FORMATS)("%s gives every member exactly one pick per round", (format) => {
    // The invariant that actually matters: nobody drafts twice in a round and
    // nobody is skipped, whatever the direction.
    for (const count of [2, 3, 8, 11, 12]) {
      const sequence = buildPickOrder(format, members(count), ROUNDS);
      for (let r = 1; r <= ROUNDS; r += 1) {
        const slots = round(sequence, r, count).split("");
        expect(new Set(slots).size).toBe(count);
      }
    }
  });

  it.each(FORMATS)("%s gives every member the same number of picks overall", (format) => {
    const count = 11; // odd, so a broken reversal shows up as an imbalance
    const sequence = buildPickOrder(format, members(count), ROUNDS);
    const tally = new Map<string, number>();
    for (const id of sequence) tally.set(id, (tally.get(id) ?? 0) + 1);
    expect([...tally.values()]).toEqual(Array(count).fill(ROUNDS));
  });
});

describe("buildPickOrder — linear", () => {
  it("repeats the same order every round", () => {
    const sequence = buildPickOrder("linear", members(4), 3);
    expect(asText(sequence)).toBe("ABCD" + "ABCD" + "ABCD");
  });

  it("still repeats at round 13", () => {
    const sequence = buildPickOrder("linear", members(4), ROUNDS);
    expect(round(sequence, 13, 4)).toBe("ABCD");
  });
});

describe("buildPickOrder — snake", () => {
  it("reverses every even round", () => {
    const sequence = buildPickOrder("snake", members(4), 4);
    expect(asText(sequence)).toBe("ABCD" + "DCBA" + "ABCD" + "DCBA");
  });

  it("gives the turn-of-round double pick to the member at the end", () => {
    // The whole point of snake: D picks last in round 1 and first in round 2.
    const sequence = buildPickOrder("snake", members(4), 2);
    expect(sequence[3]).toBe("D");
    expect(sequence[4]).toBe("D");
  });

  it("is odd rounds forward, even rounds reverse, all the way to 13", () => {
    const count = 5;
    const sequence = buildPickOrder("snake", members(count), ROUNDS);
    for (let r = 1; r <= ROUNDS; r += 1) {
      expect(round(sequence, r, count)).toBe(r % 2 === 0 ? "EDCBA" : "ABCDE");
    }
  });

  it("works at the minimum of 2 members", () => {
    const sequence = buildPickOrder("snake", members(2), 4);
    expect(asText(sequence)).toBe("AB" + "BA" + "AB" + "BA");
  });

  it("works at the maximum of 12 members", () => {
    const sequence = buildPickOrder("snake", members(12), ROUNDS);
    expect(round(sequence, 1, 12)).toBe("ABCDEFGHIJKL");
    expect(round(sequence, 2, 12)).toBe("LKJIHGFEDCBA");
    expect(round(sequence, 13, 12)).toBe("ABCDEFGHIJKL");
    expect(sequence).toHaveLength(156); // 12 × 13, the D9 worst case
  });
});

describe("buildPickOrder — snake3rr", () => {
  it("repeats round 2's direction in round 3", () => {
    const sequence = buildPickOrder("snake3rr", members(4), 3);
    expect(asText(sequence)).toBe("ABCD" + "DCBA" + "DCBA");
  });

  it("hands the third-round reversal to the last-pick member", () => {
    // A picks 1st in round 1 and D picks 4th; 3RR exists so D gets picks 5, 8
    // and 9 — the compensation. A gets 1, 8... let's be precise: with 4 members
    // the sequence is ABCD DCBA DCBA, so D owns overall 4, 5 and 9.
    const sequence = buildPickOrder("snake3rr", members(4), 3);
    const dPicks = sequence.flatMap((id, i) => (id === "D" ? [i + 1] : []));
    expect(dPicks).toEqual([4, 5, 9]);
  });

  it("is the OPPOSITE of snake from round 3 onward", () => {
    // The bug this guards: writing 3RR as "snake, but round 3 is reversed"
    // leaves round 4 reversed too, which double-rewards the same member.
    const count = 5;
    const snake = buildPickOrder("snake", members(count), ROUNDS);
    const rr = buildPickOrder("snake3rr", members(count), ROUNDS);

    for (let r = 1; r <= 2; r += 1) {
      expect(round(rr, r, count)).toBe(round(snake, r, count));
    }
    for (let r = 3; r <= ROUNDS; r += 1) {
      expect(round(rr, r, count)).not.toBe(round(snake, r, count));
    }
  });

  it("alternates normally after the reversal, to round 13", () => {
    const count = 5;
    const sequence = buildPickOrder("snake3rr", members(count), ROUNDS);
    const expected: Record<number, string> = {
      1: "ABCDE",
      2: "EDCBA",
      3: "EDCBA",
      4: "ABCDE",
      5: "EDCBA",
      6: "ABCDE",
      7: "EDCBA",
      13: "EDCBA",
    };
    for (const [r, text] of Object.entries(expected)) {
      expect(round(sequence, Number(r), count)).toBe(text);
    }
  });

  it("never gives anyone three consecutive picks", () => {
    // A reversal bug shows up as a triple, not just a wrong row.
    for (const count of [2, 3, 5, 11, 12]) {
      const sequence = buildPickOrder("snake3rr", members(count), ROUNDS);
      for (let i = 2; i < sequence.length; i += 1) {
        const triple = sequence[i] === sequence[i - 1] && sequence[i] === sequence[i - 2];
        expect(triple, `three in a row at overall ${i + 1} with ${count} members`).toBe(false);
      }
    }
  });

  it("works at the minimum of 2 members", () => {
    // The degenerate case: with 2 members a reversal is just a swap, and 3RR
    // means A picks 1st and 4th rather than 1st and 3rd.
    const sequence = buildPickOrder("snake3rr", members(2), 4);
    expect(asText(sequence)).toBe("AB" + "BA" + "BA" + "AB");
  });
});

describe("buildPickOrder — refusals", () => {
  it("refuses an empty member list", () => {
    // An empty order would let a draft "start" with nobody able to pick.
    expect(() => buildPickOrder("snake", [], ROUNDS)).toThrow(/at least one member/);
  });

  it("refuses a duplicated member", () => {
    // Would silently draft twice per round.
    expect(() => buildPickOrder("snake", ["A", "B", "A"], 2)).toThrow(/duplicate/);
  });

  it.each([0, -1, 1.5])("refuses rounds = %s", (rounds) => {
    expect(() => buildPickOrder("snake", members(4), rounds)).toThrow(/positive integer/);
  });

  it("accepts a single member, because the engine is not the place to forbid it", () => {
    // MIN_MEMBERS lives in league settings; the order generator has no opinion.
    expect(asText(buildPickOrder("snake", ["A"], 3))).toBe("AAA");
  });
});

describe("memberAt", () => {
  it("is 1-based", () => {
    const sequence = buildPickOrder("snake", members(3), 2);
    expect(memberAt(sequence, 1)).toBe("A");
    expect(memberAt(sequence, 3)).toBe("C");
    expect(memberAt(sequence, 4)).toBe("C"); // round 2 reversed
    expect(memberAt(sequence, 6)).toBe("A");
  });

  it("throws outside the draft rather than returning undefined", () => {
    const sequence = buildPickOrder("linear", members(3), 2);
    expect(() => memberAt(sequence, 0)).toThrow(/outside a draft/);
    expect(() => memberAt(sequence, 7)).toThrow(/outside a draft/);
  });
});

describe("roundAndSlot", () => {
  it("maps the first and last pick of a round", () => {
    expect(roundAndSlot(1, 4)).toEqual({ round: 1, slot: 1 });
    expect(roundAndSlot(4, 4)).toEqual({ round: 1, slot: 4 });
    expect(roundAndSlot(5, 4)).toEqual({ round: 2, slot: 1 });
    expect(roundAndSlot(8, 4)).toEqual({ round: 2, slot: 4 });
  });

  it("maps the very last pick of a full 12 × 13 draft", () => {
    expect(roundAndSlot(156, 12)).toEqual({ round: 13, slot: 12 });
  });

  it("handles an odd member count", () => {
    expect(roundAndSlot(11, 11)).toEqual({ round: 1, slot: 11 });
    expect(roundAndSlot(12, 11)).toEqual({ round: 2, slot: 1 });
  });

  it("agrees with the sequence it describes", () => {
    // Cross-check rather than restating the arithmetic: for every pick, the
    // member at that overall number must be the one in that round's slot.
    const count = 5;
    const sequence = buildPickOrder("snake3rr", members(count), ROUNDS);
    for (let overall = 1; overall <= sequence.length; overall += 1) {
      const { round: r, slot } = roundAndSlot(overall, count);
      const rowText = round(sequence, r, count);
      expect(rowText[slot - 1]).toBe(memberAt(sequence, overall));
    }
  });

  it("refuses nonsense", () => {
    expect(() => roundAndSlot(0, 4)).toThrow(/positive integer/);
    expect(() => roundAndSlot(1, 0)).toThrow(/positive integer/);
  });
});
