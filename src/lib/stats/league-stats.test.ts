import { describe, expect, it } from "vitest";

import { FULL_WEIGHTS, lineupWeights, resolveLineups, type LineupWeights } from "@/lib/lineups/lineup";

import { headToHead, leagueStats, type StatsInput } from "./league-stats";
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
    { overallNo: 1, round: 1, memberId: "a", playerId: "p1" },
    { overallNo: 2, round: 1, memberId: "b", playerId: "p3" },
    { overallNo: 3, round: 2, memberId: "b", playerId: "p4" },
    { overallNo: 4, round: 2, memberId: "a", playerId: "p2" },
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
    expect(draft.busts.map((pick) => pick.playerId)).toEqual(["p3", "p1"]);
  });
});

describe("leagueStats counts finished rounds only", () => {
  it("ignores a night from a round still being played", () => {
    const stats = leagueStats({ ...input, lines: [...lines, { playerId: "p1", round: 3, fantasyTenths: 999 }] });
    expect(stats.records.bestNight?.tenths).toBe(200);
    expect(stats.players.overall.find((row) => row.playerId === "p1")?.tenths).toBe(280);
  });
});

describe("leagueStats waffle board", () => {
  it("places every team in every round, ordered by the table", () => {
    const { waffle } = leagueStats(input);
    expect(waffle).toEqual({
      rounds: [1, 2],
      teams: 2,
      rows: [
        { memberId: "a", places: [1, 2] },
        { memberId: "b", places: [2, 1] },
      ],
    });
  });

  it("leaves a night nobody scored blank", () => {
    const { waffle } = leagueStats({ ...input, snapshots: [snap(1, [["a", 0, 0], ["b", 0, 0]])] });
    expect(waffle.rows.map((row) => row.places)).toEqual([[null], [null]]);
  });
});

describe("headToHead", () => {
  it("counts rounds won each way and the margin of each", () => {
    expect(headToHead(input.snapshots, "a", "b")).toEqual({
      a: "a",
      b: "b",
      aWins: 1,
      bWins: 1,
      ties: 0,
      rounds: [
        { round: 1, marginHundredths: 25000 },
        { round: 2, marginHundredths: -22000 },
      ],
    });
  });

  it("skips a round one of the two did not play", () => {
    expect(headToHead([snap(1, [["a", 100, 100]])], "a", "b").rounds).toEqual([]);
  });
});

describe("hindsight, captain regret and club loyalty", () => {
  // m's seven: three guards, two forwards, two centers.
  const positions = { g1: "G", g2: "G", g3: "G", f1: "F", f2: "F", c1: "C", c2: "C" } as const;
  const squad = Object.keys(positions);
  const slots = { starters: ["g3", "g2", "f1", "f2", "c1"], captain: "g3", sixth: ["c2"], bench: ["g1"], inactive: [] };
  const lineups = resolveLineups({ recorded: [{ memberId: "m", round: 1, slots }], rounds: [1, 2], memberIds: ["m", "n"] });
  const round1: Record<string, [number, string]> = {
    g1: [100, "OLY"], g2: [80, "OLY"], g3: [10, "PAN"], f1: [60, "PAN"], f2: [50, "MAD"], c1: [40, "MAD"], c2: [90, "MAD"],
  };
  const statsFor = () =>
    leagueStats({
      snapshots: [snap(1, [["m", 39000, 39000], ["n", 10000, 10000]]), snap(2, [["m", 40000, 79000], ["n", 0, 10000]])],
      lines: [
        ...Object.entries(round1).map(([playerId, [fantasyTenths, clubCode]]) => ({ playerId, round: 1, fantasyTenths, clubCode })),
        // g3 changed clubs before round 2 and, captained again, scored everything.
        { playerId: "g3", round: 2, fantasyTenths: 200, clubCode: "OLY" },
      ],
      windows: squad.map((playerId) => ({ memberId: "m", playerId, from_round: 1 })),
      weights: lineupWeights(lineups),
      lineups,
      picks: [],
      positions,
    });

  it("replays each recorded round with the best legal lineup the squad allowed", () => {
    // Round 1 best: 2-2-1 with g1 captain, c1 sixth, g3 on the bench = 525.0;
    // what was set scored 390.0. Round 2 was already perfect at 400.0.
    expect(statsFor().hindsight).toEqual([
      { memberId: "m", rounds: 2, actualTenths: 790, bestTenths: 925, iqPercent: 85, worst: { round: 1, lostTenths: 135 } },
    ]);
  });

  it("weighs the armband against the best starter of the five", () => {
    expect(statsFor().captains).toEqual([
      { memberId: "m", rounds: 2, perfect: 1, regretTenths: 70, worst: { round: 1, captainId: "g3", bestId: "g2", regretTenths: 70 } },
    ]);
  });

  it("does not judge a round with no lineup", () => {
    const stats = statsFor();
    expect(stats.hindsight.map((row) => row.memberId)).toEqual(["m"]);
    expect(stats.captains.map((row) => row.memberId)).toEqual(["m"]);
  });

  it("counts points for the club a player wore that night", () => {
    expect(statsFor().clubs).toEqual([
      {
        memberId: "m",
        totalTenths: 790,
        clubs: [
          { clubCode: "OLY", tenths: 530 },
          { clubCode: "MAD", tenths: 180 },
          { clubCode: "PAN", tenths: 80 },
        ],
      },
    ]);
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
