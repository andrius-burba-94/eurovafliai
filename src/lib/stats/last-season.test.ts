import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import { readRoundFactsInput } from "../ai/round-facts-store";
import golden from "./fixtures/e2025-boxscores.json";
import { ingestFinishedGames } from "./ingest";
import { readLeaguePlayerRounds } from "./player-rounds";
import { recomputeStandings } from "./standings-store";
import { recomputeProjections } from "./store";

/**
 * Last season's box scores, loaded mid-season for the scout — 7.2 B.
 *
 * The scout reads E2025 lines for role minutes, opponent strength and win
 * chance. Everything else a member sees is about the season being played, and
 * these tests hold it to that: the same league with and without a season of
 * E2025 lines must read the same standings, recap and pool. The lines share
 * players and round numbers with this season's on purpose — a reader that
 * forgot its season filter would sum round 1 of both years.
 */

const CURRENT = "E2026";

type GoldenGame = (typeof golden.games)[number];
const games = golden.games as GoldenGame[];
const codes = [...new Set(games.flatMap((game) => game.rows.map((row) => row.personCode)))];

function line(season: string, player: string, round: number, fantasy: number) {
  return {
    id: `${season}_${player}_${round}`,
    player,
    season,
    round,
    game_code: round,
    phase: "RS",
    club_code: "AAA",
    team_score: 80,
    opponent_score: 70,
    time_played: 1500,
    points: 10,
    reb_total: 4,
    assists: 2,
    pir: Math.round(fantasy / 10),
    fantasy_pts: fantasy,
    started: "yes",
  };
}

const thisSeason = [
  line(CURRENT, "p1", 1, 142),
  line(CURRENT, "p2", 1, 80),
  line(CURRENT, "p1", 2, 120),
  line(CURRENT, "p2", 2, 60),
];

/** A full-looking E2025 for the same two players, rounds 1–4. */
const lastSeason = [1, 2, 3, 4].flatMap((round) => [
  line("E2025", "p1", round, 300),
  line("E2025", "p2", round, 250),
]);

function league(withLastSeason: boolean): FakeDb {
  return {
    leagues: [{ id: "L1", name: "EuroVafliai 26-27", status: "season", settings: {} }],
    users: [
      { id: "u1", name: "Andrius" },
      { id: "u2", name: "Jonas" },
    ],
    league_members: [
      { id: "m1", league: "L1", user: "u1", team_name: "Einikio Kabliai" },
      { id: "m2", league: "L1", user: "u2", team_name: "" },
    ],
    drafts: [{ id: "d1", league: "L1", status: "complete", order: ["m1", "m2"], rounds: 1 }],
    picks: [
      { id: "k1", draft: "d1", overall_no: 1, member: "m1", player: "p1" },
      { id: "k2", draft: "d1", overall_no: 2, member: "m2", player: "p2" },
    ],
    roster_memberships: [
      { id: "w1", league: "L1", member: "m1", player: "p1", from_round: 1, to_round: 0, to_date: "" },
      { id: "w2", league: "L1", member: "m2", player: "p2", from_round: 1, to_round: 0, to_date: "" },
    ],
    round_lineups: [],
    transactions: [],
    standings_snapshots: [],
    fixtures: [1, 2, 3].map((round) => ({
      id: `f${round}`,
      season: CURRENT,
      game_code: round,
      round,
      phase: "RS",
      local_club: "AAA",
      road_club: "BBB",
      played: round < 3,
      local_score: round < 3 ? 80 : 0,
      road_score: round < 3 ? 70 : 0,
      utc_date: `2026-10-0${round} 18:00:00.000Z`,
    })),
    players: [
      { id: "p1", name: "Ace, Aaron", position: "G", club_code: "AAA", status: "" },
      { id: "p2", name: "Base, Bruno", position: "C", club_code: "AAA", status: "" },
    ],
    player_news: [],
    player_game_stats: withLastSeason ? [...thisSeason, ...lastSeason] : [...thisSeason],
  };
}

describe("last season's lines, beside this season's", () => {
  it("leave this season's standings exactly as they were", async () => {
    const without = fakePb({ data: league(false) });
    const withLast = fakePb({ data: league(true) });

    await recomputeStandings(without.client, CURRENT);
    await recomputeStandings(withLast.client, CURRENT);

    const tables = (db: FakeDb) => db.standings_snapshots!.map(({ round, phase, table }) => ({ round, phase, table }));
    expect(tables(withLast.db)).toEqual(tables(without.db));
    expect(tables(withLast.db).map((snap) => snap.round)).toEqual([1, 2]);
  });

  it("leave this season's pool averages exactly as they were", async () => {
    const without = fakePb({ data: league(false) });
    const withLast = fakePb({ data: league(true) });

    await recomputeProjections(without.client, CURRENT);
    await recomputeProjections(withLast.client, CURRENT);

    expect(withLast.db.players).toEqual(without.db.players);
    expect(withLast.db.players!.find((player) => player.id === "p1")).toMatchObject({
      proj_last5_games: 2,
      proj_last5_fantasy: 131,
    });
  });

  it("leave this season's recap lines and round write-up sheet exactly as they were", async () => {
    const without = fakePb({ data: league(false) });
    const withLast = fakePb({ data: league(true) });
    await recomputeStandings(without.client, CURRENT);
    await recomputeStandings(withLast.client, CURRENT);

    const recap = (client: typeof without.client) =>
      readLeaguePlayerRounds(client, { leagueId: "L1", season: CURRENT, basketNews: false, round: 2 });
    expect(await recap(withLast.client)).toEqual(await recap(without.client));

    const sheet = (client: typeof without.client) =>
      readRoundFactsInput(client, { leagueId: "L1", season: CURRENT, now: Date.parse("2026-10-09T12:00:00Z") });
    const fresh = await sheet(without.client);
    if (!fresh.ok) throw new Error(fresh.reason);
    expect(await sheet(withLast.client)).toEqual(fresh);
  });
});

describe("loading last season by hand mid-season", () => {
  /** This season under way: two rounds scored, every player averaged on them. */
  function midSeason(): FakeDb {
    const data = league(false);
    return {
      ...data,
      players: codes.map((code, index) => ({
        id: `players_${index}`,
        name: `Player ${code}`,
        person_code: code,
        proj_last5_fantasy: 150,
        proj_last5_games: 2,
        proj_last5_pir: 140,
        proj_last5_pirs: [12, 16],
        proj_season_fantasy: 150,
        proj_season_games: 2,
        proj_season_pir: 140,
      })),
      standings_snapshots: [
        {
          id: "snap1",
          league: "L1",
          season: CURRENT,
          round: 1,
          phase: "RS",
          table: [{ memberId: "m1", totalHundredths: 1420, roundHundredths: 1420 }],
        },
      ],
    };
  }

  function feed() {
    const schedule = {
      data: games.map((game) => ({
        gameCode: game.gameCode,
        round: game.round,
        played: true,
        utcDate: game.date,
        phaseType: { code: game.phase },
        local: { club: { code: game.localClub }, score: game.localScore },
        road: { club: { code: game.roadClub }, score: game.roadScore },
      })),
    };
    const side = (game: GoldenGame, club: string) => ({
      players: game.rows
        .filter((row) => row.club === club)
        .map((row) => ({
          player: { person: { code: row.personCode, alias: row.name } },
          stats: { ...row.stats, valuation: row.valuation },
        })),
    });
    return (async (input: string | URL | Request) => {
      const url = String(input);
      if (url.includes("/games?")) return Response.json(schedule);
      const game = games.find((entry) => String(entry.gameCode) === /\/games\/(\d+)\/stats/.exec(url)?.[1]);
      if (!game) return new Response("nope", { status: 404 });
      return Response.json({ local: side(game, game.localClub), road: side(game, game.roadClub) });
    }) as typeof fetch;
  }

  it("stores the lines and touches no pool average or standings table", async () => {
    const before = midSeason();
    const { client, db } = fakePb({ data: midSeason() });

    const report = await ingestFinishedGames({ pb: client, season: "E2025", currentSeason: CURRENT, doFetch: feed() });

    expect(report.created).toBe(168);
    expect(db.player_game_stats!.filter((row) => row.season === "E2025")).toHaveLength(168);
    // Its schedule is kept: the scout's opponent strength reads last season's.
    expect(db.fixtures!.filter((row) => row.season === "E2025")).toHaveLength(7);
    expect(db.players).toEqual(before.players);
    expect(db.standings_snapshots).toEqual(before.standings_snapshots);
  });

  it("still keeps the averages and standings current when the season loaded is this one", async () => {
    const { client, db } = fakePb({ data: midSeason() });

    await ingestFinishedGames({ pb: client, season: "E2025", currentSeason: "E2025", doFetch: feed() });

    expect(db.players!.some((player) => player.proj_last5_games !== 2)).toBe(true);
  });
});
