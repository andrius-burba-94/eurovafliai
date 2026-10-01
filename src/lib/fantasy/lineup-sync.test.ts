import { describe, expect, it, vi } from "vitest";

import { normalizeName } from "@/lib/rosters/normalize";

import { fakePb, type FakeRecord } from "../../../tests/unit/helpers/fake-pb";

import lineupsJson from "./fixtures/round-2-lineups.json";
import teamsJson from "./fixtures/user-fantasy-teams.json";
import { syncDueLineups, syncRoundLineups } from "./store";

vi.mock("@/lib/stats/standings-store", () => ({ recomputeStandings: vi.fn(async () => undefined) }));
vi.mock("@/lib/euroleague/http", () => ({ sleep: () => Promise.resolve() }));

const LEAGUE = "league_1";
const SEASON = "E2026";
const NOW = new Date("2026-10-01T17:00:00Z");
const POSITION: Record<string, string> = { Guard: "G", Forward: "F", Center: "C" };
const API = "https://fantaking-api.dunkest.com/api/v1";

/** Two of the real round 2 teams: Laurynas Birutis (2-2-1) and Monikutės Naktys (3-1-1). */
const TEAMS = [
  { member: "m_a", teamName: "Laurynas Birutis", fantasyTeamId: "2827842" },
  { member: "m_b", teamName: "Monikutės Naktys", fantasyTeamId: "2824079" },
] as const;

function pool(id: string, name: string, position: string, club: string, dorsal: string, fantasyId: string): FakeRecord {
  return {
    id,
    name,
    name_normalized: normalizeName(name),
    position,
    club_code: club.slice(0, 3).toUpperCase(),
    club_name: club,
    dorsal,
    status: "active",
    fantasy_id: fantasyId,
  };
}

function league(options: { roundTotals?: Record<string, number> } = {}) {
  const players: FakeRecord[] = [];
  const memberships: FakeRecord[] = [];
  for (const team of TEAMS) {
    const lineup = lineupsJson[team.fantasyTeamId].data.players;
    const squad = [
      ...lineup.map((player) =>
        pool(`p_${player.id}`, `${player.last_name}, ${player.first_name}`, POSITION[player.position.name]!, player.team.name, player.jersey, String(player.id)),
      ),
      ...["G", "F", "C"].map((position) => pool(`p_${team.member}_${position}`, `Reserve, ${position}`, position, "Reserve Club", "0", "")),
    ];
    for (const player of squad) {
      players.push(player);
      memberships.push({ id: `rm_${player.id}`, league: LEAGUE, member: team.member, player: player.id, to_date: "", from_round: 1, to_round: 0 });
    }
  }
  return fakePb({
    data: {
      leagues: [{ id: LEAGUE, status: "season", fantasy_league_id: "147868", settings: {} }],
      league_members: TEAMS.map((team) => ({ id: team.member, league: LEAGUE, team_name: team.teamName, fantasy_team_id: team.fantasyTeamId })),
      players,
      roster_memberships: memberships,
      round_lineups: [],
      fantasy_syncs: [],
      standings_snapshots: [
        {
          id: "snap_2",
          league: LEAGUE,
          season: SEASON,
          round: 2,
          phase: "RS",
          table: Object.entries(options.roundTotals ?? { m_a: 15990, m_b: 14915 }).map(([memberId, roundHundredths]) => ({
            memberId,
            totalHundredths: roundHundredths,
            roundHundredths,
          })),
        },
      ],
      fixtures: [
        { id: "f1", season: SEASON, game_code: 11, round: 2, utc_date: "2026-09-29T16:00:00Z" },
        { id: "f2", season: SEASON, game_code: 12, round: 2, utc_date: "2026-09-30T18:15:00Z" },
        { id: "f3", season: SEASON, game_code: 21, round: 3, utc_date: "2026-10-08T16:00:00Z" },
      ],
    },
  });
}

function officialGame(status = 200) {
  const calls: string[] = [];
  const doFetch = (async (url: string) => {
    calls.push(url.replace(API, ""));
    if (status !== 200) return new Response("{}", { status });
    if (url.includes("/user/fantasy-teams")) return new Response(JSON.stringify(teamsJson), { status: 200 });
    const team = /fantasy-teams\/(\d+)\/matchdays\/1529\/roster\/preview$/.exec(url)?.[1] as keyof typeof lineupsJson | undefined;
    if (team && lineupsJson[team]) return new Response(JSON.stringify(lineupsJson[team]), { status: 200 });
    return new Response("{}", { status: 404 });
  }) as typeof fetch;
  return { doFetch, calls };
}

describe("syncRoundLineups", () => {
  it("writes each team's official round 2 lineup and sets our totals beside the official ones", async () => {
    const fake = league();
    const { doFetch, calls } = officialGame();
    const run = await syncRoundLineups({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, round: 2, now: NOW, doFetch });

    expect(calls).toEqual([
      "/user/fantasy-teams?league=10&game_mode=2",
      "/fantasy-teams/2827842/matchdays/1529/roster/preview",
      "/fantasy-teams/2824079/matchdays/1529/roster/preview",
    ]);
    expect(run).toMatchObject({ kind: "lineups", mode: "apply", round: 2, status: "applied" });
    expect(run.message).toBe("2 of 2 lineups for round 2 from the official game. Every round total matches the official one.");
    expect(run.moves).toEqual([
      "Laurynas Birutis: 2-2-1 · captain Bryant, Elijah · 159.9 here, 159.9 official.",
      "Monikutės Naktys: 3-1-1 · captain Montero, Jean · 149.15 here, 149.15 official.",
    ]);
    const stored = fake.rows("round_lineups").find((row) => row.member === "m_a");
    expect(stored).toMatchObject({ league: LEAGUE, season: SEASON, round: 2, source: "synced", recorded_by: "" });
    expect(stored?.slots).toEqual({
      starters: ["p_4882", "p_3812", "p_7237", "p_3903", "p_3794"],
      captain: "p_3903",
      sixth: ["p_3771"],
      bench: ["p_3774", "p_4280", "p_3775", "p_4247"],
      inactive: ["p_m_a_G", "p_m_a_F", "p_m_a_C"],
    });
  });

  it("replaces a lineup typed here, on the same row", async () => {
    const fake = league();
    fake.rows("round_lineups").push({ id: "typed", league: LEAGUE, member: "m_a", season: SEASON, round: 2, slots: {}, source: "recorded", recorded_by: "u1" });
    await syncRoundLineups({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, round: 2, now: NOW, doFetch: officialGame().doFetch });
    const mine = fake.rows("round_lineups").filter((row) => row.member === "m_a");
    expect(mine).toHaveLength(1);
    expect(mine[0]).toMatchObject({ id: "typed", source: "synced" });
  });

  it("names the gap when our round total is not the official one", async () => {
    const fake = league({ roundTotals: { m_a: 15890, m_b: 14915 } });
    const run = await syncRoundLineups({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, round: 2, now: NOW, doFetch: officialGame().doFetch });
    expect(run.status).toBe("applied");
    expect(run.message).toMatch(/1 round total differs from the official one\.$/);
    expect(run.moves[0]).toBe("Laurynas Birutis: 2-2-1 · captain Bryant, Elijah · 158.9 here, 159.9 official (-1).");
  });

  it("links a lineup player no roster sync has seen, by name and club, and stores the link", async () => {
    const fake = league();
    fake.rows("players").find((row) => row.id === "p_4280")!.fantasy_id = "";
    const run = await syncRoundLineups({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, round: 2, now: NOW, doFetch: officialGame().doFetch });
    expect(run.status).toBe("applied");
    expect(fake.rows("players").find((row) => row.id === "p_4280")?.fantasy_id).toBe("4280");
    expect(fake.rows("round_lineups")).toHaveLength(2);
  });

  it("asks about a lineup player it cannot place, keeps that team's old lineup, and still writes the other", async () => {
    const fake = league();
    Object.assign(fake.rows("players").find((row) => row.id === "p_3903")!, {
      fantasy_id: "",
      name: "Somebody, Else",
      name_normalized: "somebody else",
      dorsal: "99",
    });
    const run = await syncRoundLineups({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, round: 2, now: NOW, doFetch: officialGame().doFetch });
    expect(run.status).toBe("blocked");
    expect(run.message).toMatch(/^1 of 2 lineups for round 2 .* 1 player to place before the rest can sync\.$/);
    expect(run.moves[0]).toBe("Laurynas Birutis: Elijah Bryant is not linked to a pool player yet.");
    expect(run.questions).toMatchObject([
      { kind: "player", fantasyPlayerId: "3903", name: "Elijah Bryant", fantasyTeamName: "Laurynas Birutis" },
    ]);
    expect(fake.rows("round_lineups").map((row) => row.member)).toEqual(["m_b"]);
  });

  it("records a refused token as one failed run and writes no lineup", async () => {
    const fake = league();
    const run = await syncRoundLineups({ pb: fake.client, leagueId: LEAGUE, token: "old", season: SEASON, round: 2, now: NOW, doFetch: officialGame(401).doFetch });
    expect(run).toMatchObject({ kind: "lineups", status: "failed" });
    expect(run.message).toMatch(/refused the token/);
    expect(fake.writes).toEqual(["create fantasy_syncs"]);
  });

  it("skips a team that had no roster in the round", async () => {
    const fake = league();
    for (const row of fake.rows("roster_memberships")) if (row.member === "m_b") row.from_round = 3;
    const { doFetch, calls } = officialGame();
    const run = await syncRoundLineups({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, round: 2, now: NOW, doFetch });
    expect(run.message).toMatch(/^1 of 1 lineups/);
    expect(calls).not.toContain("/fantasy-teams/2824079/matchdays/1529/roster/preview");
  });
});

describe("syncDueLineups", () => {
  it("fills in a finished round once, then leaves it", async () => {
    const fake = league();
    const { doFetch } = officialGame();
    const first = await syncDueLineups({ pb: fake.client, token: "tok", season: SEASON, now: NOW, doFetch });
    expect(first.map((result) => [result.run?.round, result.run?.status])).toEqual([[2, "applied"]]);
    const again = await syncDueLineups({ pb: fake.client, token: "tok", season: SEASON, now: new Date(NOW.getTime() + 60_000), doFetch });
    expect(again).toEqual([]);
  });
});
