import { describe, expect, it } from "vitest";

import { FULL_WEIGHTS, type LineupWeights } from "@/lib/lineups/lineup";

import { leagueStats, type StatsInput } from "./league-stats";
import type { RoundSnapshot } from "./standings";

const snap = (round: number, rows: [string, number, number][]): RoundSnapshot => ({
  round,
  phase: "RS",
  table: rows.map(([memberId, roundHundredths, totalHundredths]) => ({ memberId, roundHundredths, totalHundredths })),
});

// a owns p1 (G) and p2 (F); b owns p3 (C) and p4 (G); p5 (F) is a free agent.
// p2 moves from a to b from round 2.
const windows = [
  { memberId: "a", playerId: "p1", from_round: 1 },
  { memberId: "a", playerId: "p2", from_round: 1, to_round: 2 },
  { memberId: "b", playerId: "p2", from_round: 2 },
  { memberId: "b", playerId: "p3", from_round: 1 },
  { memberId: "b", playerId: "p4", from_round: 1 },
];

const lines = [
  { playerId: "p1", round: 1, fantasyTenths: 200 },
  { playerId: "p2", round: 1, fantasyTenths: 100 },
  { playerId: "p3", round: 1, fantasyTenths: 150 },
  { playerId: "p4", round: 1, fantasyTenths: 50 },
  { playerId: "p5", round: 1, fantasyTenths: 300 },
  { playerId: "p1", round: 2, fantasyTenths: 80 },
  { playerId: "p2", round: 2, fantasyTenths: 120 },
  { playerId: "p3", round: 2, fantasyTenths: 90 },
  { playerId: "p5", round: 2, fantasyTenths: 250 },
];

/** a recorded round 1: p1 captain, p2 on the bench. Everything else unrecorded. */
const weights: LineupWeights = {
  multiplierFor: (memberId, round, playerId) =>
    memberId === "a" && round === 1 ? (playerId === "p1" ? 2 : playerId === "p2" ? 0.5 : 1) : 1,
  sourceFor: (memberId, round) => (memberId === "a" && round === 1 ? "recorded" : "absent"),
};

const input: StatsInput = {
  snapshots: [snap(1, [["a", 45000, 45000], ["b", 20000, 20000]]), snap(2, [["a", 8000, 53000], ["b", 30000, 50000]])],
  lines,
  windows,
  weights,
  picks: [
    { overallNo: 1, round: 1, memberId: "a", playerId: "p1", isAuto: false },
    { overallNo: 2, round: 1, memberId: "b", playerId: "p3", isAuto: false },
    { overallNo: 3, round: 2, memberId: "b", playerId: "p4", isAuto: true },
    { overallNo: 4, round: 2, memberId: "a", playerId: "p2", isAuto: false },
  ],
  positions: { p1: "G", p2: "F", p3: "C", p4: "G", p5: "F" },
};

describe("leagueStats records", () => {
  const { records } = leagueStats(input);

  it("finds the highest and lowest round, and the widest winning margin", () => {
    expect(records.highestRound).toEqual({ memberId: "a", round: 1, hundredths: 45000 });
    expect(records.lowestRound).toEqual({ memberId: "a", round: 2, hundredths: 8000 });
    expect(records.biggestMargin).toMatchObject({ memberId: "a", round: 1, marginHundredths: 25000 });
  });

  it("counts a night only for the member who owned the player that round", () => {
    // p5's 300 belongs to nobody, so the best owned night is p1's 200 for a.
    expect(records.bestNight).toEqual({ memberId: "a", playerId: "p1", round: 1, tenths: 200 });
  });

  it("counts the captain's night at the armband's ×2", () => {
    expect(records.bestCaptainNight).toEqual({ memberId: "a", playerId: "p1", round: 1, tenths: 400 });
  });
});

describe("leagueStats teams", () => {
  it("profiles each team's rounds, steadiness and honours", () => {
    const a = leagueStats(input).teams.find((team) => team.memberId === "a")!;
    expect(a).toMatchObject({ rounds: 2, averageHundredths: 26500, bestHundredths: 45000, worstHundredths: 8000, roundsWon: 1, spoons: 1 });
    expect(a.spreadHundredths).toBe(18500);
  });
});

describe("leagueStats lineups", () => {
  it("adds up what the bench left behind and whether the captain call was right", () => {
    const a = leagueStats(input).lineups.find((row) => row.memberId === "a")!;
    // p2's 100 on the bench at ×0.5 left 50 behind; p1 captained and was the best starter.
    expect(a).toEqual({ memberId: "a", benchLostTenths: 50, captainRounds: 1, captainHits: 1 });
  });

  it("does not judge a round nobody recorded", () => {
    const b = leagueStats(input).lineups.find((row) => row.memberId === "b")!;
    expect(b).toEqual({ memberId: "b", benchLostTenths: 0, captainRounds: 0, captainHits: 0 });
    expect(leagueStats({ ...input, weights: FULL_WEIGHTS }).lineups.every((row) => row.captainRounds === 0)).toBe(true);
  });
});

describe("leagueStats draft", () => {
  it("values a pick by what the player scored for the member who drafted them", () => {
    const { draft } = leagueStats(input);
    // p2 was a's late pick but left after round 1: only its 100 counts for a.
    expect(draft.steals.map((pick) => [pick.playerId, pick.tenths])).toEqual([["p2", 100], ["p4", 50]]);
    expect(draft.autoPicks).toBe(1);
    expect(draft.autoAverageTenths).toBe(50);
  });
});

describe("leagueStats players", () => {
  const { players } = leagueStats(input);

  it("ranks the season's scorers, with who holds them now", () => {
    expect(players.overall[0]).toEqual({ playerId: "p5", tenths: 550, games: 2, ownerId: null });
    expect(players.overall.find((row) => row.playerId === "p2")?.ownerId).toBe("b");
  });

  it("splits leaders by position and lists the best free agents", () => {
    expect(players.byPosition.G.map((row) => row.playerId)).toEqual(["p1", "p4"]);
    expect(players.freeAgents.map((row) => row.playerId)).toEqual(["p5"]);
  });

  it("only calls a player hot with at least two recent games", () => {
    expect(players.hot.map((row) => row.playerId)).not.toContain("p4");
  });
});
