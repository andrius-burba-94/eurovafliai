import { describe, expect, it } from "vitest";

import type { Recap } from "@/lib/stats/recap";
import type { RoundSnapshot } from "@/lib/stats/standings";

import { movementOf, ordinal, roundStory } from "./story";

const recap = (rows: [string, number][]): Recap => ({
  round: 3,
  rows: rows.map(([memberId, hundredths]) => ({ memberId, hundredths })),
  bestNight: null,
  biggestSwing: null,
});

const snap = (round: number, totals: [string, number][]): RoundSnapshot => ({
  round,
  phase: "RS",
  table: totals.map(([memberId, totalHundredths]) => ({ memberId, totalHundredths, roundHundredths: 0 })),
});

const names = { a: "Alpha", b: "Bravo", c: "Charlie", d: "Delta" };

describe("roundStory", () => {
  it("names the winner, the margin and the spoon", () => {
    const story = roundStory(recap([["a", 14090], ["b", 13120], ["c", 9110]]))!;
    expect(story.winner.memberId).toBe("a");
    expect(story.margin).toBe(970);
    expect(story.spoon?.memberId).toBe("c");
  });

  it("has no spoon and no margin for a one-team night", () => {
    const story = roundStory(recap([["a", 500]]))!;
    expect(story.margin).toBeNull();
    expect(story.spoon).toBeNull();
  });

  it("does not crown anybody on a night nobody scored", () => {
    expect(roundStory(recap([["a", 0], ["b", 0]]))).toBeNull();
    expect(roundStory(null)).toBeNull();
  });
});

describe("movementOf", () => {
  const snapshots = [
    snap(2, [["a", 300], ["b", 280], ["c", 250], ["d", 100]]),
    snap(3, [["c", 420], ["a", 410], ["b", 400], ["d", 200]]),
  ];

  it("says how far a member climbed and whom they passed", () => {
    expect(movementOf(snapshots, "c", names)).toEqual({
      rank: 1,
      previousRank: 3,
      moved: 2,
      passed: ["a", "b"],
      gap: 0,
      totalHundredths: 420,
    });
  });

  it("says a drop as a negative move, with the gap to the leader", () => {
    const moved = movementOf(snapshots, "b", names)!;
    expect(moved.moved).toBe(-1);
    expect(moved.passed).toEqual([]);
    expect(moved.gap).toBe(20);
  });

  it("has no previous rank on the first counted round", () => {
    const first = movementOf(snapshots.slice(0, 1), "b", names)!;
    expect(first).toMatchObject({ rank: 2, previousRank: null, moved: 0, passed: [] });
  });

  it("breaks a tie on team name, the way the table does", () => {
    const tied = [snap(1, [["b", 100], ["a", 100]])];
    expect(movementOf(tied, "a", names)?.rank).toBe(1);
  });

  it("returns null for somebody not in the table, or no table at all", () => {
    expect(movementOf(snapshots, "zz", names)).toBeNull();
    expect(movementOf([], "a", names)).toBeNull();
  });
});

describe("ordinal", () => {
  it("says places the way people do", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101].map(ordinal)).toEqual([
      "1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "23rd", "101st",
    ]);
  });
});
