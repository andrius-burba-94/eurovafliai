import { describe, expect, it } from "vitest";

import type { RoundSnapshot } from "@/lib/stats/standings";

import { badgesFrom, honoursByRound, memberHonours } from "./badges";

const night = (round: number, scores: [string, number][]): RoundSnapshot => ({
  round,
  phase: "RS",
  table: scores.map(([memberId, roundHundredths]) => ({ memberId, roundHundredths, totalHundredths: 0 })),
});

const season = [
  night(1, [["a", 900], ["b", 800], ["c", 700], ["d", 100]]),
  night(2, [["a", 850], ["b", 900], ["c", 600], ["d", 100]]),
  night(3, [["a", 950], ["b", 500], ["c", 700], ["d", 600]]),
];

describe("honoursByRound", () => {
  it("crowns the night's top score and hands the spoon to its lowest", () => {
    expect(honoursByRound(season).map((round) => [round.winners, round.spoons])).toEqual([
      [["a"], ["d"]],
      [["b"], ["d"]],
      [["a"], ["b"]],
    ]);
  });

  it("shares a crown on a tie, and crowns nobody on a night nobody scored", () => {
    expect(honoursByRound([night(1, [["a", 500], ["b", 500], ["c", 100]])])[0]!.winners).toEqual(["a", "b"]);
    expect(honoursByRound([night(1, [["a", 0], ["b", 0]])])[0]).toEqual({ round: 1, winners: [], spoons: [] });
  });

  it("gives no spoon on a one-team night", () => {
    expect(honoursByRound([night(1, [["a", 500]])])[0]!.spoons).toEqual([]);
  });
});

describe("memberHonours", () => {
  it("counts crowns, spoons and the current top-three streak", () => {
    const byId = Object.fromEntries(memberHonours(season).map((member) => [member.memberId, member]));
    expect(byId.a).toMatchObject({ roundsWon: 2, spoons: 0, topThreeStreak: 3, bestRoundHundredths: 950 });
    expect(byId.b).toMatchObject({ roundsWon: 1, spoons: 1, topThreeStreak: 0 });
    expect(byId.d).toMatchObject({ spoons: 2, topThreeStreak: 1 });
  });

  it("a streak ends at the first night outside the top three", () => {
    const broken = [...season, night(4, [["a", 100], ["b", 900], ["c", 800], ["d", 700]])];
    const a = memberHonours(broken).find((member) => member.memberId === "a")!;
    expect(a.topThreeStreak).toBe(0);
  });
});

describe("badgesFrom", () => {
  it("awards on fire, crowns and spoons, flattering first", () => {
    expect(badgesFrom(season).map((badge) => [badge.id, badge.memberId, badge.title])).toEqual([
      ["on-fire", "a", "On fire"],
      ["on-fire", "c", "On fire"],
      ["crowned", "a", "Crowned ×2"],
      ["crowned", "b", "Crowned"],
      ["spoon-collector", "b", "Wooden spoon"],
      ["spoon-collector", "d", "Wooden spoon ×2"],
    ]);
  });

  it("awards nothing before a round is counted", () => {
    expect(badgesFrom([])).toEqual([]);
  });
});
