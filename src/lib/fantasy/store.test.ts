import { beforeEach, describe, expect, it, vi } from "vitest";

import { normalizeName } from "@/lib/rosters/normalize";
import { fakePb, type FakeRecord } from "../../../tests/unit/helpers/fake-pb";

import { planSync } from "./plan";
import { repairRoundMoves, runFantasySync, syncDueLeagues } from "./store";

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

function pool(id: string, name: string, club: string, code: string, dorsal: string, fantasyId = ""): FakeRecord {
  return { id, name, name_normalized: normalizeName(name), club_code: code, club_name: club, dorsal, status: "active", fantasy_id: fantasyId };
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

/** Round 3 is matchday 1530. Without a move log, the log's address answers 404. */
function fetchReturning(body: unknown, status = 200, moves?: unknown) {
  const calls: string[] = [];
  const doFetch = (async (url: string) => {
    calls.push(url);
    if (url.includes("/user/fantasy-teams")) {
      return new Response(JSON.stringify({ data: [{ fantasy_league: { id: 147 }, matchday: { id: 1530, number: 3 } }] }), { status: 200 });
    }
    if (url.includes("/fantasy-trades")) return new Response(JSON.stringify(moves ?? {}), { status: moves ? 200 : 404 });
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { doFetch, calls };
}

/** Alpha signed Grant for Sloukas, as the official log records it. */
const SWAP_LOG = {
  data: [
    {
      id: 900,
      player_1: { id: OFFICIAL.grant!.id, fantasy_team: { id: 100, name: "Alpha" } },
      player_2: { id: OFFICIAL.sloukas!.id, fantasy_team: null },
    },
  ],
};

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
        // Linked by an earlier pass: once released he is on no official roster to match.
        pool("p_sloukas", "Sloukas, Konstantinos", "Panathinaikos AKTOR Athens", "PAN", "11", "12"),
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
    const { doFetch, calls } = fetchReturning(SWAPPED, 200, SWAP_LOG);
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch });

    expect(calls).toEqual([
      "https://fantaking-api.dunkest.com/api/v1/fantasy-leagues/147/rosters",
      "https://fantaking-api.dunkest.com/api/v1/user/fantasy-teams?league=10&game_mode=2",
      "https://fantaking-api.dunkest.com/api/v1/fantasy-leagues/147/fantasy-trades?matchday=1530",
    ]);
    expect(run.status).toBe("applied");
    expect(run.message).toBe("1 change from the official rosters for round 3.");
    expect(run.moves).toEqual(["Alpha exchanged Konstantinos Sloukas for Jerian Grant, counting from round 3."]);
    expect(open(fake)).toEqual(["m_a:p_grant", "m_a:p_nunn", "m_b:p_vezenkov"]);
    expect(fake.rows("roster_memberships").find((row) => row.id === "rm_2")).toMatchObject({ to_round: 3 });
    expect(fake.rows("transactions").map((row) => row.type)).toEqual(["drop", "add"]);
    expect(fake.rows("chat_messages")).toHaveLength(1);
    expect(fake.rows("fantasy_syncs")[0]).toMatchObject({ status: "applied", mode: "apply", round: 3 });
  });

  it("still applies from the roster difference when the move log cannot be read, and says so", async () => {
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning(SWAPPED).doFetch });
    expect(run.status).toBe("applied");
    expect(run.message).toMatch(/^1 change from the official rosters for round 3\. The official move log did not explain the change/);
    expect(open(fake)).toEqual(["m_a:p_grant", "m_a:p_nunn", "m_b:p_vezenkov"]);
  });

  it("does not read the move log when nothing changed", async () => {
    const { doFetch, calls } = fetchReturning(UNCHANGED, 200, SWAP_LOG);
    await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch });
    expect(calls).toEqual(["https://fantaking-api.dunkest.com/api/v1/fantasy-leagues/147/rosters"]);
  });

  it("stores the links it found, so the next run trusts them", async () => {
    await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning(UNCHANGED).doFetch });
    expect(fake.rows("league_members").map((row) => row.fantasy_team_id)).toEqual(["100", "101"]);
    expect(fake.rows("players").find((row) => row.id === "p_nunn")?.fantasy_id).toBe("11");
  });

  it("does nothing, and says so, when the rosters already agree", async () => {
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: APPLY, now: NOW, doFetch: fetchReturning(UNCHANGED).doFetch });
    expect(run).toMatchObject({ status: "applied", message: "The official rosters match the league's." });
    expect(fake.rows("transactions")).toEqual([]);
  });

  it("previews without touching a roster while they are still open", async () => {
    const run = await runFantasySync({ pb: fake.client, leagueId: LEAGUE, token: "tok", season: SEASON, decision: PREVIEW, now: NOW, doFetch: fetchReturning(SWAPPED, 200, SWAP_LOG).doFetch });
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

describe("repairRoundMoves", () => {
  // Round 4 of EuroVafliai 26-27: Bravo traded Theis and Hoard to Alpha for
  // Sorkin and Mantzoukas, and Alpha released Theis for Diarra before the
  // next pass. The rosters are right; the rows a roster difference wrote are not.
  const OFFICIAL_IDS: Record<string, number> = { sorkin: 1, mantz: 2, bloss: 3, hoard: 4, theis: 5, faried: 6, ndiaye: 7, diarra: 8, dokossi: 9 };
  const before = { m_a: ["sorkin", "mantz", "bloss"], m_b: ["hoard", "theis", "faried"] };
  const after = { m_a: ["hoard", "ndiaye", "diarra"], m_b: ["sorkin", "mantz", "dokossi"] };
  const team = (member: string) => (member === "m_a" ? 100 : 101);
  const LOG = {
    data: [
      ["m_b", "sorkin", "theis", "m_a"],
      ["m_b", "mantz", "hoard", "m_a"],
      ["m_a", "diarra", "theis", null],
      ["m_a", "ndiaye", "bloss", null],
      ["m_b", "dokossi", "faried", null],
    ].map(([member, arrival, departure, to], index) => ({
      id: 1000 + index,
      player_1: { id: OFFICIAL_IDS[arrival!], fantasy_team: { id: team(member!) } },
      player_2: { id: OFFICIAL_IDS[departure!], fantasy_team: to ? { id: team(to) } : null },
    })),
  };
  const teamNames: Record<string, string> = { m_a: "Alpha", m_b: "Bravo" };

  function storedRound() {
    const windows = [
      ...Object.entries(before).flatMap(([member, players]) =>
        players.map((player) => {
          const kept = (after as Record<string, string[]>)[member]!.includes(player);
          return { id: `rm_${member}_${player}`, league: LEAGUE, member, player: `p_${player}`, from_round: 1, to_round: kept ? 0 : 4, to_date: kept ? "" : "2026-10-09 10:00:00.000Z" };
        }),
      ),
      ...Object.entries(after).flatMap(([member, players]) =>
        players
          .filter((player) => !(before as Record<string, string[]>)[member]!.includes(player))
          .map((player) => ({ id: `rm_${member}_${player}_4`, league: LEAGUE, member, player: `p_${player}`, from_round: 4, to_round: 0, to_date: "" })),
      ),
    ];
    const seatsOf = (rosters: Record<string, string[]>) =>
      Object.entries(rosters).flatMap(([member, players]) => players.map((player) => ({ id: `rm_${member}_${player}`, member, player: `p_${player}` })));
    const old = planSync({
      round: 4,
      seats: seatsOf(before),
      target: new Map(Object.entries(after).map(([member, players]) => [member, players.map((player) => `p_${player}`)])),
      teamName: (id) => teamNames[id]!,
      playerName: (id) => id.slice(2),
    });
    return fakePb({
      data: {
        leagues: [{ id: LEAGUE, status: "season", fantasy_league_id: "147" }],
        league_members: [
          { id: "m_a", league: LEAGUE, team_name: "Alpha", fantasy_team_id: "100" },
          { id: "m_b", league: LEAGUE, team_name: "Bravo", fantasy_team_id: "101" },
        ],
        players: Object.entries(OFFICIAL_IDS).map(([key, official]) => ({ ...pool(`p_${key}`, `${key}, Fake`, "Club", "CLB", "1"), fantasy_id: String(official) })),
        roster_memberships: windows,
        transactions: old.steps.map((step, index) => ({
          id: `old_${index}`,
          league: LEAGUE,
          type: step.plan.type,
          from_round: 4,
          members: step.plan.members,
          players_in: step.plan.playersIn,
          players_out: step.plan.playersOut,
          note: step.note,
          date: "2026-10-09 10:00:00.000Z",
        })),
      },
    });
  }

  function logFetch() {
    return (async (url: string) => {
      if (url.includes("/user/fantasy-teams")) {
        return new Response(JSON.stringify({ data: [{ fantasy_league: { id: 147 }, matchday: { id: 1531, number: 4 } }] }), { status: 200 });
      }
      if (url.endsWith("/fantasy-trades?matchday=1531")) return new Response(JSON.stringify(LOG), { status: 200 });
      return new Response("{}", { status: 404 });
    }) as typeof fetch;
  }

  const repair = (fake: ReturnType<typeof storedRound>, write: boolean) =>
    repairRoundMoves({ pb: fake.client, leagueId: LEAGUE, token: "tok", round: 4, now: NOW, write, doFetch: logFetch() });

  const trade = (fake: ReturnType<typeof storedRound>) => fake.rows("transactions").find((row) => row.type === "trade");

  it("reports what it would change and writes nothing on a dry run", async () => {
    const fake = storedRound();
    const rows = fake.rows("transactions").length;
    const result = await repair(fake, false);
    expect(result.status).toBe("would-repair");
    expect(result.added.some((note) => /Alpha sent \S+ sorkin, \S+ mantz to Bravo for \S+ theis, \S+ hoard\./.test(note))).toBe(true);
    expect(fake.rows("transactions")).toHaveLength(rows);
  });

  it("records the trade with both teams that held Theis, and leaves every roster window alone", async () => {
    const fake = storedRound();
    const windows = JSON.stringify(fake.rows("roster_memberships"));
    expect(trade(fake)?.players_in).toEqual({ m_a: ["p_hoard"], m_b: ["p_sorkin", "p_mantz"] });

    expect((await repair(fake, true)).status).toBe("repaired");
    expect(trade(fake)?.players_in).toEqual({ m_a: ["p_theis", "p_hoard"], m_b: ["p_sorkin", "p_mantz"] });
    expect(fake.rows("transactions").find((row) => row.type === "drop" && (row.members as string[])[0] === "m_a")?.players_out).toEqual({ m_a: ["p_theis", "p_bloss"] });
    expect(fake.rows("transactions").every((row) => row.date === "2026-10-09 10:00:00.000Z")).toBe(true);
    expect(JSON.stringify(fake.rows("roster_memberships"))).toBe(windows);
    expect(fake.rows("chat_messages")).toHaveLength(0);
  });

  it("finds nothing to do the second time", async () => {
    const fake = storedRound();
    await repair(fake, true);
    const rows = JSON.stringify(fake.rows("transactions"));
    expect(await repair(fake, true)).toMatchObject({ status: "unchanged", added: [], removed: [] });
    expect(JSON.stringify(fake.rows("transactions"))).toBe(rows);
  });

  it("finishes a run that died between adding and removing", async () => {
    const fake = storedRound();
    const stale = fake.rows("transactions").map((row) => ({ ...row }));
    await repair(fake, true);
    for (const row of stale) await fake.client.collection("transactions").create(row);
    const result = await repair(fake, true);
    expect(result.added).toEqual([]);
    expect(result.removed.length).toBeGreaterThan(0);
    // Two drops, the trade, two adds: Bravo's Faried-for-Dokossi rows were right all along.
    expect(fake.rows("transactions").map((row) => row.type).sort()).toEqual(["add", "add", "drop", "drop", "trade"]);
    expect(await repair(fake, true)).toMatchObject({ status: "unchanged" });
  });

  it("leaves the rows alone when the log does not explain the round", async () => {
    const fake = storedRound();
    const rows = JSON.stringify(fake.rows("transactions"));
    const result = await repairRoundMoves({
      pb: fake.client,
      leagueId: LEAGUE,
      token: "tok",
      round: 4,
      now: NOW,
      write: true,
      doFetch: (async (url: string) =>
        url.includes("/user/fantasy-teams")
          ? new Response(JSON.stringify({ data: [{ fantasy_league: { id: 147 }, matchday: { id: 1531, number: 4 } }] }), { status: 200 })
          : new Response(JSON.stringify({ data: LOG.data.slice(0, 3) }), { status: 200 })) as typeof fetch,
    });
    expect(result.status).toBe("unexplained");
    expect(JSON.stringify(fake.rows("transactions"))).toBe(rows);
  });
});
