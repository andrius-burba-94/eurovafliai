import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeName } from "@/lib/rosters/normalize";
import { fakePb, type FakeRecord } from "../../../tests/unit/helpers/fake-pb";

import { planSync } from "./plan";
import { runFantasySync, syncDueLeagues } from "./store";

vi.mock("@/lib/stats/standings-store", () => ({ recomputeStandings: vi.fn(async () => undefined) }));
vi.mock("@/lib/euroleague/http", () => ({ sleep: () => Promise.resolve() }));

const LEAGUE = "league_1";
const SEASON = "E2026";
const APPLY = { mode: "apply", round: 3 } as const;
const PREVIEW = { mode: "preview", round: 3 } as const;
const NOW = new Date("2026-10-01T16:10:00Z");

type Official = { id: number; first: string; last: string; jersey: string; team: string; club: string };

const OFFICIAL: Record<string, Official> = {
  nunn: { id: 11, first: "Kendrick", last: "Nunn", jersey: "25", team: "Alpha", club: "Panathinaikos AKTOR Athens" },
  sloukas: { id: 12, first: "Kostas", last: "Sloukas", jersey: "11", team: "Alpha", club: "Panathinaikos AKTOR Athens" },
  grant: { id: 13, first: "Jerian", last: "Grant", jersey: "2", team: "Alpha", club: "Panathinaikos AKTOR Athens" },
  vezenkov: { id: 21, first: "Sasha", last: "Vezenkov", jersey: "14", team: "Bravo", club: "Olympiacos Piraeus" },
};

function pool(id: string, name: string, club: string, code: string, dorsal: string): FakeRecord {
  return { id, name, name_normalized: normalizeName(name), club_code: code, club_name: club, dorsal, status: "active", fantasy_id: "" };
}

function rostersResponse(teams: Record<string, (keyof typeof OFFICIAL)[]>) {
  return {
    data: Object.entries(teams).map(([name, players], index) => ({
      id: 100 + index,
      name,
      user: { first_name: "M", last_name: String(index) },
      players: players.map((key) => {
        const player = OFFICIAL[key]!;
        return {
          id: player.id,
          first_name: player.first,
          last_name: player.last,
          jersey: player.jersey,
          position: { name: "Guard" },
          team: { id: player.club.length, name: player.club },
        };
      }),
    })),
  };
}

function fetchReturning(body: unknown, status = 200) {
  const calls: string[] = [];
  const doFetch = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { doFetch, calls };
}

function league() {
  return fakePb({
    data: {
      leagues: [{ id: LEAGUE, status: "season", fantasy_league_id: "147" }],
      league_members: [
        { id: "m_a", league: LEAGUE, team_name: "Alpha", fantasy_team_id: "" },
        { id: "m_b", league: LEAGUE, team_name: "Bravo", fantasy_team_id: "" },
      ],
      players: [
        pool("p_nunn", "Nunn, Kendrick", "Panathinaikos AKTOR Athens", "PAN", "25"),
        pool("p_sloukas", "Sloukas, Konstantinos", "Panathinaikos AKTOR Athens", "PAN", "11"),
        pool("p_grant", "Grant, Jerian", "Panathinaikos AKTOR Athens", "PAN", "2"),
        pool("p_vezenkov", "Vezenkov, Aleksandar", "Olympiacos Piraeus", "OLY", "14"),
      ],
      roster_memberships: [
        { id: "rm_1", league: LEAGUE, member: "m_a", player: "p_nunn", to_date: "", from_round: 1, to_round: 0 },
        { id: "rm_2", league: LEAGUE, member: "m_a", player: "p_sloukas", to_date: "", from_round: 1, to_round: 0 },
        { id: "rm_3", league: LEAGUE, member: "m_b", player: "p_vezenkov", to_date: "", from_round: 1, to_round: 0 },
      ],
      transactions: [],
      chat_messages: [],
      fantasy_syncs: [],
      fixtures: [
        { id: "f1", season: SEASON, game_code: 21, round: 3, utc_date: "2026-10-01T16:00:00Z" },
        { id: "f2", season: SEASON, game_code: 30, round: 3, utc_date: "2026-10-02T18:30:00Z" },
      ],
    },
  });
}

const SWAPPED = rostersResponse({ Alpha: ["nunn", "grant"], Bravo: ["vezenkov"] });
const UNCHANGED = rostersResponse({ Alpha: ["nunn", "sloukas"], Bravo: ["vezenkov"] });

function open(fake: ReturnType<typeof league>) {
  return fake
    .rows("roster_memberships")
    .filter((row) => !row.to_date)
    .map((row) => `${row.member}:${row.player}`)
    .sort();
}

describe("runFantasySync", () => {
  let fake: ReturnType<typeof league>;
  beforeEach(() => {
    fake = league();
  });

  it("applies a free-agent swap during the freeze: two records, one announcement, rosters equal", async () => {
    const { doFetch, calls } = fetchReturning(SWAPPED);
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch });

    expect(calls).toEqual(["https://fantaking-api.dunkest.com/api/v1/fantasy-leagues/147/rosters"]);
    expect(run.status).toBe("applied");
    expect(run.moves).toEqual(["Alpha exchanged Konstantinos Sloukas for Jerian Grant, counting from round 3."]);
    expect(open(fake)).toEqual(["m_a:p_grant", "m_a:p_nunn", "m_b:p_vezenkov"]);
    expect(fake.rows("roster_memberships").find((row) => row.id === "rm_2")).toMatchObject({ to_round: 3 });
    expect(fake.rows("transactions").map((row) => row.type)).toEqual(["drop", "add"]);
    expect(fake.rows("chat_messages")).toHaveLength(1);
    expect(fake.rows("fantasy_syncs")[0]).toMatchObject({ status: "applied", mode: "apply", round: 3 });
  });

  it("stores the links it found, so the next run trusts them", async () => {
    await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning(UNCHANGED).doFetch });
    expect(fake.rows("league_members").map((row) => row.fantasy_team_id)).toEqual(["100", "101"]);
    expect(fake.rows("players").find((row) => row.id === "p_sloukas")?.fantasy_id).toBe("12");
  });

  it("does nothing, and says so, when the rosters already agree", async () => {
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning(UNCHANGED).doFetch });
    expect(run).toMatchObject({ status: "applied", message: "The official rosters match the league's." });
    expect(fake.rows("transactions")).toEqual([]);
  });

  it("previews without touching a roster while they are still open", async () => {
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: PREVIEW, now: NOW, doFetch: fetchReturning(SWAPPED).doFetch });
    expect(run.status).toBe("preview");
    expect(run.message).toBe("1 change waiting for round 3 to tip off.");
    expect(run.moves).toHaveLength(1);
    expect(fake.rows("transactions")).toEqual([]);
    expect(open(fake)).toEqual(["m_a:p_nunn", "m_a:p_sloukas", "m_b:p_vezenkov"]);
  });

  it("records a refused token as a failed run and writes nothing else", async () => {
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "old", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning({}, 401).doFetch });
    expect(run.status).toBe("failed");
    expect(run.message).toMatch(/refused the token/);
    expect(fake.writes).toEqual(["create fantasy_syncs"]);
  });

  it("blocks on a player it cannot place, and asks", async () => {
    fake.rows("players").splice(fake.rows("players").findIndex((row) => row.id === "p_grant"), 1);
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning(SWAPPED).doFetch });
    expect(run.status).toBe("blocked");
    expect(run.questions).toMatchObject([{ kind: "player", fantasyPlayerId: "13", name: "Jerian Grant", fantasyTeamName: "Alpha" }]);
    expect(fake.rows("transactions")).toEqual([]);
  });

  it("finishes an interrupted apply from its stored steps before anything else", async () => {
    const steps = planSync({
      round: 3,
      seats: [
        { id: "rm_1", member: "m_a", player: "p_nunn" },
        { id: "rm_2", member: "m_a", player: "p_sloukas" },
        { id: "rm_3", member: "m_b", player: "p_vezenkov" },
      ],
      target: new Map([
        ["m_a", ["p_nunn", "p_grant"]],
        ["m_b", ["p_vezenkov"]],
      ]),
      teamName: (id) => (id === "m_a" ? "Alpha" : "Bravo"),
      playerName: (id) => id,
    }).steps;
    fake.rows("fantasy_syncs").push({
      id: "run_old",
      league: LEAGUE,
      mode: "apply",
      round: 3,
      status: "applying",
      message: "1 change.",
      moves: [],
      questions: [],
      steps,
      ran_at: "2026-10-01 16:05:00.000Z",
    });
    fake.rows("roster_memberships").find((row) => row.id === "rm_2")!.to_date = "2026-10-01 16:05:00.000Z";

    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning(SWAPPED).doFetch });
    expect(fake.rows("fantasy_syncs").find((row) => row.id === "run_old")?.status).toBe("applied");
    expect(open(fake)).toEqual(["m_a:p_grant", "m_a:p_nunn", "m_b:p_vezenkov"]);
    expect(run.message).toBe("The official rosters match the league's.");
  });

  it("refuses a league that is not linked", async () => {
    fake.rows("leagues")[0]!.fantasy_league_id = "";
    await expect(
      runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning(UNCHANGED).doFetch }),
    ).rejects.toThrow(/not linked/);
  });
});

describe("syncDueLeagues", () => {
  it("applies once at the lock, then waits an hour", async () => {
    const fake = league();
    const { doFetch, calls } = fetchReturning(UNCHANGED);
    const first = await syncDueLeagues({ pb: fake.client, token: "tok", season: SEASON, now: NOW, doFetch });
    expect(first.map((result) => result.run?.mode)).toEqual(["apply"]);
    const soon = await syncDueLeagues({ pb: fake.client, token: "tok", season: SEASON, now: new Date(NOW.getTime() + 20 * 60_000), doFetch });
    expect(soon).toEqual([]);
    expect(calls).toHaveLength(1);
  });

  it("skips a league nobody has linked", async () => {
    const fake = league();
    fake.rows("leagues")[0]!.fantasy_league_id = "";
    expect(await syncDueLeagues({ pb: fake.client, token: "tok", season: SEASON, now: NOW })).toEqual([]);
  });
});
