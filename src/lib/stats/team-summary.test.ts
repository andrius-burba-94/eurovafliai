import { describe, expect, it } from "vitest";

import type { LeagueStats } from "./league-stats";
import { teamSummary } from "./team-summary";

const stats = {
  rounds: [1, 2],
  records: { highestRound: null, lowestRound: null, biggestMargin: null, bestNight: null, bestCaptainNight: null },
  teams: [{ memberId: "a", rounds: 2, averageHundredths: 100, bestHundredths: 120, worstHundredths: 80, spreadHundredths: 20, roundsWon: 1, topThree: 2, spoons: 0 }],
  lineups: [
    { memberId: "a", benchLostTenths: 42, captainRounds: 2, captainHits: 1 },
    { memberId: "b", benchLostTenths: 0, captainRounds: 0, captainHits: 0 },
  ],
  draft: { steals: [], busts: [] },
  players: { overall: [], byPosition: { G: [], F: [], C: [] }, hot: [], freeAgents: [] },
  waffle: { rounds: [1, 2], teams: 2, rows: [{ memberId: "a", places: [1, 2] }, { memberId: "b", places: [2, null] }] },
  hindsight: [{ memberId: "a", rounds: 2, actualTenths: 90, bestTenths: 100, iqPercent: 90, worst: { round: 2, lostTenths: 10 } }],
  captains: [],
  clubs: [{ memberId: "a", totalTenths: 200, clubs: [{ clubCode: "ZAL", tenths: 120 }] }],
} satisfies LeagueStats;

describe("teamSummary", () => {
  it("picks one team's finishes and its rows from every section", () => {
    const summary = teamSummary(stats, "a");
    expect(summary.finishes).toEqual([{ round: 1, place: 1 }, { round: 2, place: 2 }]);
    expect(summary.teams).toBe(2);
    expect(summary.profile?.roundsWon).toBe(1);
    expect(summary.lineup?.benchLostTenths).toBe(42);
    expect(summary.hindsight?.iqPercent).toBe(90);
    expect(summary.captain).toBeNull();
    expect(summary.clubs?.clubs[0]?.clubCode).toBe("ZAL");
  });

  it("does not call a team with no recorded lineup a perfect one", () => {
    const summary = teamSummary(stats, "b");
    expect(summary.lineup).toBeNull();
    expect(summary.finishes).toEqual([{ round: 1, place: 2 }, { round: 2, place: null }]);
  });

  it("knows nothing of a team the stats do not", () => {
    const summary = teamSummary(stats, "z");
    expect(summary.profile).toBeNull();
    expect(summary.finishes.every((finish) => finish.place === null)).toBe(true);
  });
});
