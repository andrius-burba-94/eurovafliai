import { describe, expect, it } from "vitest";

import type { Position } from "@/lib/engine";
import { DEFAULT_LINEUP_TEMPLATE, multipliersOf, type LineupSquadPlayer } from "@/lib/lineups/lineup";

import lineupsJson from "./fixtures/round-2-lineups.json";
import teamsJson from "./fixtures/user-fantasy-teams.json";
import {
  linkLineupPlayers,
  matchdayIdForRound,
  parseCurrentMatchday,
  parseRoundLineup,
  slotsFromOfficial,
} from "./lineup";

type Golden = (typeof lineupsJson)[keyof typeof lineupsJson];

const POSITION: Record<string, Position> = { Guard: "G", Forward: "F", Center: "C" };
const INACTIVE: LineupSquadPlayer[] = [
  { playerId: "p_x1", position: "G" },
  { playerId: "p_x2", position: "F" },
  { playerId: "p_x3", position: "C" },
];

function setUp(golden: Golden) {
  const lineup = parseRoundLineup(golden);
  const playerIdFor = new Map(golden.data.players.map((player) => [String(player.id), `p_${player.id}`]));
  const squad: LineupSquadPlayer[] = [
    ...golden.data.players.map((player) => ({ playerId: `p_${player.id}`, position: POSITION[player.position.name]! })),
    ...INACTIVE,
  ];
  return { lineup, playerIdFor, squad };
}

function weightedTotal(golden: Golden, slots: Parameters<typeof multipliersOf>[0]): number {
  const multipliers = multipliersOf(slots);
  const hundredths = golden.data.players.reduce(
    (sum, player) => sum + Math.round(player.pts * 100) * (multipliers.get(`p_${player.id}`) ?? 0),
    0,
  );
  return hundredths / 100;
}

describe("slotsFromOfficial on the real round 2 lineups", () => {
  it.each([
    ["2827842", "2-2-1", 159.9],
    ["2824079", "3-1-1", 149.15],
    ["2824586", "2-1-2", 140.55],
    ["2827280", "1-3-1", 95.25],
  ] as const)("team %s (%s) scores the official %d", (teamId, _shape, official) => {
    const golden = lineupsJson[teamId];
    const { lineup, playerIdFor, squad } = setUp(golden);
    const verdict = slotsFromOfficial({ lineup, playerIdFor, squad, template: DEFAULT_LINEUP_TEMPLATE });
    if (!verdict.ok) throw new Error(verdict.reason);
    expect(lineup.pts).toBe(official);
    expect(weightedTotal(golden, verdict.slots)).toBeCloseTo(official, 2);
  });

  it("puts court 1–5 in the five, 6 as sixth man, 7–10 on the bench and the unnamed three inactive", () => {
    const { lineup, playerIdFor, squad } = setUp(lineupsJson["2827842"]);
    const verdict = slotsFromOfficial({ lineup, playerIdFor, squad, template: DEFAULT_LINEUP_TEMPLATE });
    expect(verdict).toEqual({
      ok: true,
      slots: {
        starters: ["p_4882", "p_3812", "p_7237", "p_3903", "p_3794"],
        captain: "p_3903",
        sixth: ["p_3771"],
        bench: ["p_3774", "p_4280", "p_3775", "p_4247"],
        inactive: ["p_x1", "p_x2", "p_x3"],
      },
    });
  });
});

describe("slotsFromOfficial refuses rather than guesses", () => {
  it("names a player nobody has linked", () => {
    const { lineup, playerIdFor, squad } = setUp(lineupsJson["2827842"]);
    const partial = new Map(playerIdFor);
    partial.delete("3903");
    const verdict = slotsFromOfficial({ lineup, playerIdFor: partial, squad, template: DEFAULT_LINEUP_TEMPLATE });
    expect(verdict).toEqual({ ok: false, reason: "Elijah Bryant is not linked to a pool player yet." });
  });

  it("will not pick a captain when the official lineup has two", () => {
    const { lineup, playerIdFor, squad } = setUp(lineupsJson["2827842"]);
    const twoCaptains = { ...lineup, players: lineup.players.map((player) => ({ ...player, captain: player.courtPosition <= 2 || player.captain })) };
    const verdict = slotsFromOfficial({ lineup: twoCaptains, playerIdFor, squad, template: DEFAULT_LINEUP_TEMPLATE });
    expect(verdict).toEqual({ ok: false, reason: "The official lineup names 3 captains." });
  });

  it("refuses a lineup that names a player the round's roster does not hold", () => {
    const { lineup, playerIdFor, squad } = setUp(lineupsJson["2827842"]);
    const verdict = slotsFromOfficial({
      lineup,
      playerIdFor,
      squad: squad.filter((player) => player.playerId !== "p_3771"),
      template: DEFAULT_LINEUP_TEMPLATE,
    });
    expect(verdict).toEqual({ ok: false, reason: "That lineup names a player who is not on the roster." });
  });

  it("refuses a five our positions say is not a legal formation", () => {
    const { lineup, playerIdFor, squad } = setUp(lineupsJson["2827842"]);
    const allGuards = squad.map((player) => ({ ...player, position: "G" as const }));
    const verdict = slotsFromOfficial({ lineup, playerIdFor, squad: allGuards, template: DEFAULT_LINEUP_TEMPLATE });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) expect(verdict.reason).toMatch(/^5-0-0 is not one of the five legal formations/);
  });
});

describe("linkLineupPlayers", () => {
  const blazevic = parseRoundLineup(lineupsJson["2827842"]).players.find((player) => player.id === "4280")!.official;
  const row = (id: string, name: string, dorsal: string) => ({
    id,
    name,
    nameNormalized: name.toLowerCase().replace(",", ""),
    clubCode: "ZAL",
    clubName: "Zalgiris Kaunas",
    dorsal,
    fantasyId: "",
    status: "active",
  });

  it("links a player traded away before any roster sync, from his lineup", () => {
    const { links, questions } = linkLineupPlayers([{ player: blazevic, teamName: "Laurynas Birutis" }], [row("p_bl", "Blazevic, Marek", blazevic.jersey)]);
    expect(links).toEqual([{ playerId: "p_bl", fantasyId: "4280" }]);
    expect(questions).toEqual([]);
  });

  it("asks when two official players would claim one pool row", () => {
    const twin = { ...blazevic, id: "9999" };
    const { links, questions } = linkLineupPlayers(
      [
        { player: blazevic, teamName: "Laurynas Birutis" },
        { player: twin, teamName: "Kalaškračiai" },
      ],
      [row("p_bl", "Blazevic, Marek", blazevic.jersey)],
    );
    expect(links).toEqual([]);
    expect(questions.map((question) => question.kind === "player" && question.fantasyPlayerId)).toEqual(["4280", "9999"]);
  });

  it("leaves a player alone who is already linked", () => {
    const linked = { ...row("p_bl", "Blazevic, Marek", blazevic.jersey), fantasyId: "4280" };
    expect(linkLineupPlayers([{ player: blazevic, teamName: "Laurynas Birutis" }], [linked])).toEqual({ links: [], questions: [] });
  });
});

describe("parseRoundLineup", () => {
  it("throws on a payload of the wrong shape", () => {
    expect(() => parseRoundLineup({ data: { players: [{ id: 1 }] } })).toThrow(/changed shape at data\.players\.0/);
  });

  it("reads a lineup with no points yet as zero", () => {
    expect(parseRoundLineup({ data: { pts: null, players: [] } })).toEqual({ pts: 0, players: [] });
  });
});

describe("matchdays", () => {
  it("reads the current matchday from the token owner's team in the linked league", () => {
    expect(parseCurrentMatchday(teamsJson, "147868")).toEqual({ id: 1530, number: 3 });
  });

  it("says when the token's owner has no team in that league", () => {
    expect(() => parseCurrentMatchday(teamsJson, "1")).toThrow(/no team in official league 1/);
  });

  it("counts a round's matchday from the current one: 1528 is round 1, 1529 round 2", () => {
    const current = { id: 1530, number: 3 };
    expect([1, 2, 3].map((round) => matchdayIdForRound(current, round))).toEqual([1528, 1529, 1530]);
  });
});
