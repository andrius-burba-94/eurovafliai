import { describe, expect, it } from "vitest";

import type { Recap } from "@/lib/stats/recap";
import type { RoundSnapshot } from "@/lib/stats/standings";

import { liveRecap, movementOf, ordinal, roundStory } from "./story";

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

describe("liveRecap", () => {
  const ranks = (rows: [string, number][]) => rows.map(([memberId, roundHundredths]) => ({ memberId, roundHundredths }));

  it("ranks the open round by its points so far, not by the season total", () => {
    const live = liveRecap(3, ranks([["a", 4000], ["b", 9050], ["c", 6000]]), null);
    expect(live.round).toBe(3);
    expect(live.rows.map((row) => row.memberId)).toEqual(["b", "c", "a"]);
    const story = roundStory(live)!;
    expect(story.winner.memberId).toBe("b");
    expect(story.margin).toBe(3050);
    expect(story.spoon?.memberId).toBe("a");
  });

  it("breaks a tie on member id, like a finished round", () => {
    expect(liveRecap(3, ranks([["c", 500], ["a", 500], ["b", 900]]), null).rows.map((row) => row.memberId)).toEqual(["b", "a", "c"]);
  });

  it("tells no story before anybody has scored", () => {
    expect(roundStory(liveRecap(3, ranks([["a", 0], ["b", 0]]), null))).toBeNull();
    expect(roundStory(liveRecap(3, [], null))).toBeNull();
  });

  it("keeps the best night only once it counted for something", () => {
    const night = { playerId: "p1", memberId: "a", fantasyTenths: 312 };
    expect(liveRecap(3, ranks([["a", 3120]]), night).bestNight).toEqual(night);
    expect(liveRecap(3, ranks([["a", 0]]), { ...night, fantasyTenths: 0 }).bestNight).toBeNull();
  });
});

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
