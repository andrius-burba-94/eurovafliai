import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { RoundLadder } from "@/components/round-ladder";
import { PositionPatch } from "@/components/board";
import { countByPosition, type Position } from "@/lib/engine";
import { navFor } from "@/lib/nav/items";
import { leaguePosition } from "@/lib/positions";
import { normalizeName } from "@/lib/rosters/normalize";
import { formatHundredths } from "@/lib/stats/scoring";
import { snapshotRowsFrom } from "@/lib/stats/standings";
import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import {
  BasketNewsSessionExpired,
  readBasketNewsLeague,
  readBasketNewsLeagueLineups,
  readBasketNewsLineup,
  readBasketNewsScore,
  readBasketNewsTeamReference,
  readBasketNewsTeams,
} from "./client";
import { processBasketNewsJobs, queueBasketNewsLeagues } from "./jobs";
import { queueBasketNewsSync, readBasketNewsPlayerRounds } from "./repository";
import type { BasketNewsSource } from "./sync";

type Captured = {
  league: { id: string; title: string; leagueId: string; draft: { picks: { playerId: string; fantasyTeamId: string; player: { team: { positions: string[] } | null } }[] } };
  teams: { id: string; title: string }[];
  lineups: Record<string, { fantasyRound: number; players: { playerId: string; player: { team: { positions: string[] } | null } }[] }>;
  scores: Record<string, { pointsGained: number; pointsTotal: number }>;
};
const fixture = JSON.parse(readFileSync(new URL("../../../tests/fixtures/basketnews-hostinger.json", import.meta.url), "utf8")) as Captured;
const playerPool = JSON.parse(readFileSync(new URL("../../../tests/fixtures/basketnews-pool.json", import.meta.url), "utf8")) as {
  id: string; name: string; name_normalized: string; club_code: string; club_name: string; dorsal: string; fantasy_id: string; status: string;
}[];
const OWN_TEAM = "6ab26d119050fb90221c5697";
const LEAGUE = "basketnewsleague";

type Overrides = { lineups?: Record<string, unknown>; scores?: Record<string, unknown>; league?: unknown[] };

function capturedSource(expired = false, extra: Overrides = {}): BasketNewsSource {
  const doFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string | number> };
    const { query, variables } = request;
    let key: string;
    let value: unknown;
    if (query.includes("draftLeagueFantasyTeamLineupsFromClient")) {
      key = "draftLeagueFantasyTeamLineupsFromClient";
      value = extra.league ?? [];
    } else if (query.includes("fantasyTeamRecordFromClient")) {
      key = "fantasyTeamRecordFromClient";
      value = { id: OWN_TEAM, title: "Einikio Kabliai", leagueId: fixture.league.leagueId, fantasyLeagues: [{ fantasyLeagueId: fixture.league.id }] };
    } else if (query.includes("fantasyLeagueRecordFromClient")) {
      key = "fantasyLeagueRecordFromClient";
      value = fixture.league;
    } else if (query.includes("allFantasyLeagueTeamsFromClient")) {
      key = "allFantasyLeagueTeamsFromClient";
      value = fixture.teams;
    } else if (query.includes("fantasyTeamLineupRecordFromClient")) {
      if (expired) return new Response(JSON.stringify({ errors: [{ message: "Forbidden" }] }), { status: 200 });
      key = "fantasyTeamLineupRecordFromClient";
      const round = Number(variables.round);
      value = extra.lineups?.[`${variables.team}:${round}`] ?? fixture.lineups[`${variables.team}:${round}`] ?? null;
    } else {
      key = "fantasyTeamScoreRecordFromClient";
      value = extra.scores?.[`${variables.team}:${variables.round}`] ?? fixture.scores[`${variables.team}:${variables.round}`] ?? null;
    }
    return new Response(JSON.stringify({ data: { [key]: value } }), { status: 200 });
  }) as typeof fetch;
  return {
    teamReference: (id) => readBasketNewsTeamReference(id, doFetch),
    league: (id, competition) => readBasketNewsLeague(id, competition, doFetch),
    teams: (id) => readBasketNewsTeams(id, doFetch),
    lineup: (team, round, competition, cookie) => readBasketNewsLineup(team, round, competition, cookie, doFetch),
    score: (team, round, competition) => readBasketNewsScore(team, round, competition, doFetch),
    leagueLineups: (id, competition) => readBasketNewsLeagueLineups(id, competition, doFetch),
  };
}

function leagueDb(missingPlayer?: string): FakeDb {
  return {
    leagues: [{ id: LEAGUE, name: fixture.league.title, slug: "hostinger-cashiorai", season: "2026-27", status: "setup", commissioner: "owner", basketnews_team_id: OWN_TEAM, basketnews_league_id: "" }],
    users: [{ id: "owner", email: "owner@example.invalid", name: "Andrius" }],
    league_members: [{ id: "ownmember", league: LEAGUE, user: "owner", team_name: "Andrius", slug: "andrius-burba", draft_position: 0, basketnews_team_id: "" }],
    players: playerPool.filter((row) => row.id !== missingPlayer).map((row) => ({ ...row, position: "F", basketnews_id: "", basketnews_position: "", slug: "" })),
    fantasy_syncs: [], drafts: [], picks: [], roster_memberships: [], transactions: [], chat_messages: [],
    round_lineups: [], standings_snapshots: [], player_game_stats: [], fixtures: [],
  };
}

const unique = {
  picks: [["draft", "overall_no"], ["draft", "player"]],
  roster_memberships: [{ fields: ["league", "player"], whereEmpty: "to_date" }],
  round_lineups: [["league", "member", "season", "round"]],
  standings_snapshots: [["league", "season", "round"]],
  player_game_stats: [["player", "season", "game_code"]],
  fantasy_syncs: [{ fields: ["active_league"], whereSet: "active_league" }],
  players: [{ fields: ["basketnews_id"], whereSet: "basketnews_id" }],
  league_members: [{ fields: ["basketnews_team_id"], whereSet: "basketnews_team_id" }, { fields: ["league", "slug"], whereSet: "slug" }],
};

describe("BasketNews worker import", () => {
  it("imports nine teams, draft, rosters and all captured rounds, then refreshes without duplicates", async () => {
    const data = leagueDb();
    const vezenkov = playerPool.find((row) => normalizeName(row.name).includes("vezenkov"))!.id;
    data.player_game_stats = [
      { id: "box-one", player: vezenkov, season: "E2026", round: 1, game_code: 1, phase: "RS", fantasy_pts: 999, basketnews_raw_pts: 0 },
      { id: "box-two", player: vezenkov, season: "E2026", round: 1, game_code: 2, phase: "RS", fantasy_pts: 999, basketnews_raw_pts: 999 },
    ];
    const db = fakePb({ data, uniqueIndexes: unique });
    const first = await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:00:00Z"));
    expect(await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:00:01Z"))).toBe(first);
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    expect(db.rows("fantasy_syncs")[0]).toMatchObject({ status: "applied", active_league: "" });
    expect(db.rows("league_members")).toHaveLength(9);
    expect(db.rows("users")).toHaveLength(9);
    expect(db.rows("league_members").find((row) => row.basketnews_team_id === OWN_TEAM)?.user).toBe("owner");
    expect(db.rows("league_members").find((row) => row.basketnews_team_id === OWN_TEAM)?.slug).toBe("einikio-kabliai");
    expect(db.rows("picks")).toHaveLength(117);
    expect(db.rows("round_lineups")).toHaveLength(27);
    expect(db.rows("standings_snapshots")).toHaveLength(3);
    expect(db.rows("players").filter((row) => row.basketnews_id)).toHaveLength(130);
    const sourcePositions = new Map<string, Position>();
    const sourcePosition = (word: string): Position => {
      if (word === "guard") return "G";
      if (word === "forward") return "F";
      if (word === "center") return "C";
      throw new Error(`Unexpected BasketNews position: ${word}`);
    };
    for (const pick of fixture.league.draft.picks) sourcePositions.set(pick.playerId, sourcePosition(pick.player.team!.positions[0]!));
    for (const lineup of Object.values(fixture.lineups)) for (const entry of lineup.players) {
      if (entry.player.team) sourcePositions.set(entry.playerId, sourcePosition(entry.player.team.positions[0]!));
    }
    expect(sourcePositions.size).toBe(130);
    const playersById = new Map(db.rows("players").map((row) => [row.id, row]));
    const mappedPosition = (id: string): Position => {
      const row = playersById.get(id)!;
      return leaguePosition({ position: row.position as Position, basketnews_position: row.basketnews_position as Position }, "basketnews");
    };
    for (const row of db.rows("players").filter((player) => player.basketnews_id)) {
      expect(mappedPosition(row.id)).toBe(sourcePositions.get(String(row.basketnews_id)));
      expect(leaguePosition({ position: row.position as Position, basketnews_position: row.basketnews_position as Position }, "euroleague")).toBe("F");
    }
    for (const member of db.rows("league_members")) {
      const drafted = db.rows("picks").filter((pick) => pick.member === member.id).map((pick) => ({ position: mappedPosition(String(pick.player)) }));
      expect(countByPosition(drafted)).toEqual({ G: 5, F: 5, C: 3 });
      const current = db.rows("roster_memberships").filter((window) => window.member === member.id && !window.to_date && !window.to_round)
        .map((window) => ({ position: mappedPosition(String(window.player)) }));
      expect(countByPosition(current)).toEqual({ G: 5, F: 5, C: 3 });
    }
    const ownRoster = db.rows("roster_memberships").filter((window) => window.member === "ownmember" && !window.to_date && !window.to_round);
    const ownCounts = countByPosition(ownRoster.map((window) => ({ position: mappedPosition(String(window.player)) })));
    const rosterHtml = renderToStaticMarkup(createElement("div", null, ...(["G", "F", "C"] as const).map((position) => createElement(PositionPatch, { position, count: ownCounts[position] }))));
    expect(rosterHtml).toContain(">5</span><span>G</span>");
    expect(rosterHtml).toContain(">5</span><span>F</span>");
    expect(rosterHtml).toContain(">3</span><span>C</span>");
    expect(db.rows("player_game_stats").map((row) => row.basketnews_raw_pts)).toEqual([3200, 0]);
    const ownMember = db.rows("league_members").find((row) => row.basketnews_team_id === OWN_TEAM)!;
    const navigation = navFor({ league: {
      id: LEAGUE, name: fixture.league.title, status: "season", youMemberId: ownMember.id,
      isCommissioner: true, canManage: true, rolled: false, sourceOwned: true,
    }, isRosterManager: false });
    expect(navigation.flatMap((group) => group.items).some((item) => item.key === "matchday")).toBe(true);
    for (const [key, score] of Object.entries(fixture.scores)) {
      const [teamId, index] = key.split(":");
      const member = db.rows("league_members").find((row) => row.basketnews_team_id === teamId)!;
      const lineup = db.rows("round_lineups").find((row) => row.member === member.id && row.round === Number(index) + 1)!;
      const result = lineup.basketnews_result as { totalHundredths: number; calculatedHundredths: number };
      expect(result.totalHundredths).toBe(Math.round(score.pointsGained * 100));
      expect(result.calculatedHundredths).toBe(result.totalHundredths);
      const snapshot = db.rows("standings_snapshots").find((row) => row.round === Number(index) + 1)!;
      expect(snapshotRowsFrom(snapshot.table).find((row) => row.memberId === member.id)?.roundHundredths).toBe(result.totalHundredths);
    }
    const own = db.rows("league_members").find((row) => row.basketnews_team_id === OWN_TEAM)!;
    const sourceLines = await readBasketNewsPlayerRounds(db.client, LEAGUE, "E2026", own.id);
    expect(sourceLines).toHaveLength(39);
    expect(sourceLines.some((row) => row.fantasy_pts !== 0)).toBe(true);
    const final = db.rows("standings_snapshots").find((row) => row.round === 3)!;
    const names = Object.fromEntries(db.rows("league_members").map((row) => [row.id, String(row.team_name)]));
    const html = renderToStaticMarkup(createElement(RoundLadder, {
      rows: snapshotRowsFrom(final.table).map((row) => ({ memberId: row.memberId, hundredths: row.roundHundredths })).sort((a, b) => b.hundredths - a.hundredths),
      names, styles: {}, hrefOf: (id: string) => `/l/hostinger-cashiorai/${id}`,
      marks: true, testId: "basketnews-round", label: "BasketNews round 3",
    }));
    expect(html).toContain("Einikio Kabliai");
    expect(html).toContain("110.25");
    expect(html.match(/data-testid="basketnews-round-row"/g)).toHaveLength(9);
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:15:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    expect(db.rows("picks")).toHaveLength(117);
    expect(db.rows("round_lineups")).toHaveLength(27);
    expect(db.rows("standings_snapshots")).toHaveLength(3);
    expect(db.rows("league_members").find((row) => row.basketnews_team_id === OWN_TEAM)?.slug).toBe("einikio-kabliai");
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:16:00Z"));
    expect(db.rows("fantasy_syncs")[2]).toMatchObject({ status: "queued", job_meta: {} });
  });

  it("fails an expired session before changing the league", async () => {
    const db = fakePb({ data: leagueDb(), uniqueIndexes: unique });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:00:00Z"));
    await processBasketNewsJobs(db.client, "expired", capturedSource(true));
    expect(db.rows("fantasy_syncs")[0]).toMatchObject({ status: "failed", active_league: "" });
    expect(db.rows("league_members")).toHaveLength(1);
    expect(db.rows("picks")).toHaveLength(0);
    expect(db.rows("round_lineups")).toHaveLength(0);
    expect(new BasketNewsSessionExpired().message).toContain("stored league data is unchanged");
  });

  it("records mapping questions without writing an incomplete draft", async () => {
    const missing = playerPool.find((row) => normalizeName(row.name).includes("vezenkov"))!.id;
    const db = fakePb({ data: leagueDb(missing), uniqueIndexes: unique });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    expect(db.rows("fantasy_syncs")[0]).toMatchObject({ status: "blocked" });
    expect(db.rows("picks")).toHaveLength(0);
    expect(db.rows("league_members")).toHaveLength(1);
  });

  it("asks about two BasketNews players who both match one of ours instead of failing the job", async () => {
    const data = leagueDb();
    data.players = data.players!.filter((row) => row.name !== "Ward, Tyson");
    const vezenkov = data.players.find((row) => row.name === "Vezenkov, Alexanter")!;
    Object.assign(vezenkov, { name: "Vezenkov Ward, Alexanter", name_normalized: normalizeName("Vezenkov Ward Alexanter") });
    const db = fakePb({ data, uniqueIndexes: unique });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    const job = db.rows("fantasy_syncs")[0]!;
    expect(job.status).toBe("blocked");
    expect((job.questions as { name: string }[]).map((question) => question.name).sort()).toEqual(["Aleksandr Vezenkov", "Tyson Ward"]);
    expect(db.rows("picks")).toHaveLength(0);
  });

  it("continues after a partial write using the last completed round", async () => {
    let interrupt = true;
    const db = fakePb({
      data: leagueDb(), uniqueIndexes: unique,
      hooks: { beforeCreate(collection, data) {
        if (interrupt && collection === "round_lineups" && data.round === 2) {
          interrupt = false;
          throw new Error("temporary storage failure");
        }
      } },
    });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    expect(db.rows("fantasy_syncs")[0]).toMatchObject({ status: "failed", job_meta: { nextRound: 2 } });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:01:00Z"));
    expect(db.rows("fantasy_syncs")[1]).toMatchObject({ status: "queued", job_meta: { nextRound: 2 } });
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    expect(db.rows("fantasy_syncs")[1]).toMatchObject({ status: "applied" });
    expect(db.rows("picks")).toHaveLength(117);
    expect(db.rows("round_lineups")).toHaveLength(27);
    expect(db.rows("standings_snapshots")).toHaveLength(3);
  });

  it("keeps BasketNews's official score when a final round's lineup does not add up to it, and says so", async () => {
    const db = fakePb({ data: leagueDb(), uniqueIndexes: unique });
    const team = fixture.teams[6]!;
    const score = fixture.scores[`${team.id}:1`]!;
    const official = { ...score, pointsGained: score.pointsGained + 13.75 };
    const warnings: string[] = [];
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource(false, { scores: { [`${team.id}:1`]: official } }), (message) => warnings.push(message));

    const job = db.rows("fantasy_syncs")[0]!;
    expect(job).toMatchObject({ status: "applied" });
    const expected = `Round 2: ${team.title} adds up to ${formatHundredths(Math.round(score.pointsGained * 100))} from its lineup, not the official ${formatHundredths(Math.round(official.pointsGained * 100))}; the official score is kept.`;
    expect(String(job.message)).toContain(expected);
    expect(warnings).toEqual([`BasketNews · league ${LEAGUE} · ${expected}`]);
    expect(db.rows("round_lineups")).toHaveLength(27);
    expect(db.rows("standings_snapshots")).toHaveLength(3);

    const member = db.rows("league_members").find((row) => row.basketnews_team_id === team.id)!;
    const stored = db.rows("round_lineups").find((row) => row.member === member.id && row.round === 2)!
      .basketnews_result as { totalHundredths: number; calculatedHundredths: number };
    expect(stored.totalHundredths).toBe(Math.round(official.pointsGained * 100));
    expect(stored.calculatedHundredths).toBe(Math.round(score.pointsGained * 100));
    const snapshot = db.rows("standings_snapshots").find((row) => row.round === 2)!;
    expect(snapshotRowsFrom(snapshot.table).find((row) => row.memberId === member.id)?.roundHundredths).toBe(stored.totalHundredths);
  });

  it("weighs a player by the role he froze in on his game day, so a change between game days still adds up", async () => {
    const data = leagueDb();
    const clubs = [...new Set(playerPool.map((row) => row.club_code))].filter((code) => code !== "MAD");
    const game = (id: string, local: string, road: string, utcDate: string) =>
      ({ id, season: "E2026", round: 3, game_code: Number(id.replace(/\D/g, "")), local_club: local, road_club: road, utc_date: utcDate, played: false });
    // Real Madrid play on Tuesday; everybody else on Wednesday.
    data.fixtures = [
      game("g1", "MAD", "OTH", "2026-10-13T17:45:00Z"),
      ...clubs.map((code, index) => game(`g${index + 2}`, code, "OTH", "2026-10-14T18:00:00Z")),
    ];
    const db = fakePb({ data, uniqueIndexes: unique });
    const team = fixture.teams[6]!;
    const key = `${team.id}:2`;
    type Entry = { playerId: string; cardIdentifier: string; player: { lastName: string; fantasy_pts: number | null } };
    const tuesday = fixture.lineups[key] as unknown as { players: Entry[] };
    const card = (entry: Entry, cardIdentifier: string, pts?: number) =>
      ({ ...entry, cardIdentifier, player: { ...entry.player, ...(pts === undefined ? {} : { fantasy_pts: pts }) } });
    const luwawu = tuesday.players.find((entry) => entry.player.lastName === "Luwawu-Cabarrot")!;
    const gach = tuesday.players.find((entry) => entry.player.lastName === "Gach")!;
    // Wednesday: Luwawu-Cabarrot (played Tuesday as a starter) goes inactive; Gach starts and scores 16.5.
    const wednesday = {
      ...tuesday,
      players: tuesday.players.map((entry) =>
        entry === luwawu ? card(entry, gach.cardIdentifier) : entry === gach ? card(entry, luwawu.cardIdentifier, 16.5) : entry),
    };
    const score = fixture.scores[key]!;
    const warnings: string[] = [];

    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-13T17:55:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource(), (message) => warnings.push(message), () => new Date("2026-10-13T18:00:00Z"));
    for (const row of db.rows("fixtures")) row.played = true;
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-15T09:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource(false, {
      lineups: { [key]: wednesday },
      scores: { [key]: { ...score, pointsGained: score.pointsGained + 16.5 } },
    }), (message) => warnings.push(message), () => new Date("2026-10-15T09:00:00Z"));

    expect(db.rows("fantasy_syncs").map((row) => row.status)).toEqual(["applied", "applied"]);
    expect(warnings).toEqual([]);
    const member = db.rows("league_members").find((row) => row.basketnews_team_id === team.id)!;
    const stored = db.rows("round_lineups").find((row) => row.member === member.id && row.round === 3)!;
    const result = stored.basketnews_result as { final: boolean; totalHundredths: number; calculatedHundredths: number };
    expect(result).toMatchObject({ final: true, totalHundredths: Math.round((score.pointsGained + 16.5) * 100) });
    expect(result.calculatedHundredths).toBe(result.totalHundredths);
    const playerOf = (sourceId: string) => db.rows("players").find((row) => row.basketnews_id === sourceId)!.id;
    const roles = stored.roles as Record<string, { role: string; day: string }>;
    expect(roles[playerOf(luwawu.playerId)]).toMatchObject({ role: "starter", day: "2026-10-13" });
    expect(roles[playerOf(gach.playerId)]).toMatchObject({ role: "starter", day: "2026-10-14" });
  });

  it("mirrors an open round and a trade from the league-wide lineups, then corrects that round once its games are played", async () => {
    const data = leagueDb();
    const games = (round: number, played: boolean) => ({ id: `game${round}`, season: "E2026", round, game_code: round, played });
    data.fixtures = [games(1, true), games(2, true), games(3, true), games(4, false), games(5, false)];
    const db = fakePb({ data, uniqueIndexes: unique });
    const [teamA, teamB] = fixture.teams;
    const last = (team: string) => fixture.lineups[`${team}:2`] as unknown as { players: { playerId: string; cardIdentifier: string }[] };
    const benchOf = (team: string) => last(team).players.find((entry) => entry.cardIdentifier === "b-2")!;
    const fromA = benchOf(teamA!.id);
    const fromB = benchOf(teamB!.id);
    const swapped = (team: string, out: typeof fromA, into: typeof fromA) => ({
      ...last(team), fantasyRound: 4,
      players: last(team).players.map((entry) => entry.playerId === out.playerId ? { ...into, cardIdentifier: out.cardIdentifier } : entry),
    });
    const lineups: Record<string, unknown> = {};
    const partial: Record<string, unknown> = {};
    const settled: Record<string, unknown> = {};
    for (const team of fixture.teams) {
      lineups[`${team.id}:3`] = { ...last(team.id), fantasyRound: 3 };
      const score = fixture.scores[`${team.id}:2`]!;
      partial[`${team.id}:3`] = { ...score, pointsGained: score.pointsGained - 5 };
      settled[`${team.id}:3`] = score;
    }
    // Only our own team's round-5 lineup is readable per team, as on BasketNews.
    lineups[`${OWN_TEAM}:4`] = { ...last(OWN_TEAM), fantasyRound: 4 };
    const league = fixture.teams.map((team) => ({
      ...(team.id === teamA!.id ? swapped(teamA!.id, fromA, fromB) : team.id === teamB!.id ? swapped(teamB!.id, fromB, fromA) : { ...last(team.id), fantasyRound: 4 }),
      fantasyTeamId: team.id,
    }));

    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-08T12:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource(false, { lineups, scores: partial, league }));
    expect(db.rows("fantasy_syncs")[0]).toMatchObject({ status: "applied", job_meta: { nextRound: 4 } });
    expect(db.rows("round_lineups")).toHaveLength(45);
    const resultOf = (round: number) => db.rows("round_lineups").filter((row) => row.round === round)
      .map((row) => row.basketnews_result as { final: boolean; totalHundredths: number } | null);
    expect(resultOf(3).every((result) => result?.final === true)).toBe(true);
    expect(resultOf(4).every((result) => result?.final === false)).toBe(true);
    expect(resultOf(5).every((result) => result === null)).toBe(true);
    const memberOf = (sourceTeam: string) => db.rows("league_members").find((row) => row.basketnews_team_id === sourceTeam)!.id;
    const playerOf = (sourceId: string) => db.rows("players").find((row) => row.basketnews_id === sourceId)!.id;
    const holder = (sourceId: string) => db.rows("roster_memberships").find((row) => row.player === playerOf(sourceId) && !row.to_round && !row.to_date)!;
    expect(holder(fromA.playerId)).toMatchObject({ member: memberOf(teamB!.id), from_round: 5 });
    expect(holder(fromB.playerId)).toMatchObject({ member: memberOf(teamA!.id), from_round: 5 });

    const deals = db.rows("transactions").length;
    expect(deals).toBeGreaterThan(0);
    db.rows("fixtures").find((row) => row.round === 4)!.played = true;
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-09T23:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource(false, { lineups, scores: settled, league }));
    expect(db.rows("fantasy_syncs")[1]).toMatchObject({ status: "applied" });
    expect(resultOf(4).every((result) => result?.final === true)).toBe(true);
    const own = db.rows("round_lineups").find((row) => row.round === 4 && row.member === memberOf(teamA!.id))!;
    expect((own.basketnews_result as { totalHundredths: number }).totalHundredths).toBe(Math.round(fixture.scores[`${teamA!.id}:2`]!.pointsGained * 100));
    expect(holder(fromA.playerId)).toMatchObject({ member: memberOf(teamB!.id), from_round: 5 });
    // Re-reading round 4 must not replay its older roster over the round-5 trade.
    expect(db.rows("transactions")).toHaveLength(deals);
    const snapshot = db.rows("standings_snapshots").find((row) => row.round === 4)!;
    expect(snapshotRowsFrom(snapshot.table).find((row) => row.memberId === memberOf(teamA!.id))?.roundHundredths)
      .toBe(Math.round(fixture.scores[`${teamA!.id}:2`]!.pointsGained * 100));
  });
});

describe("queueBasketNewsLeagues", () => {
  it("queues a league on a game day's first tip-off, not again that day, and not every fifteen minutes between rounds", async () => {
    const data = leagueDb();
    data.fixtures = [
      { id: "g1", season: "E2026", round: 3, game_code: 1, local_club: "MAD", road_club: "BAR", utc_date: "2026-10-13T17:45:00Z", played: false },
      { id: "g2", season: "E2026", round: 3, game_code: 2, local_club: "PAN", road_club: "OLY", utc_date: "2026-10-14T18:00:00Z", played: false },
    ];
    const db = fakePb({ data, uniqueIndexes: unique });
    const tick = async (iso: string) => {
      const queued = await queueBasketNewsLeagues(db.client, "E2026", new Date(iso));
      for (const row of db.rows("fantasy_syncs")) if (row.status === "queued") Object.assign(row, { status: "applied", active_league: "" });
      return queued;
    };
    expect(await tick("2026-10-13T09:00:00Z")).toBe(1);
    expect(await tick("2026-10-13T09:15:00Z")).toBe(0);
    expect(await tick("2026-10-13T17:50:00Z")).toBe(1);
    expect(await tick("2026-10-13T21:00:00Z")).toBe(0);
    expect(await tick("2026-10-14T09:00:00Z")).toBe(0);
    expect(await tick("2026-10-14T18:10:00Z")).toBe(1);
  });
});

describe("BasketNews sync and stored positions (7.2 D)", () => {
  it("adds a position where none is stored and never changes a stored one", async () => {
    const data = leagueDb();
    const valanciunas = playerPool.find((row) => normalizeName(row.name).includes("valanciunas"))!.id;
    const vezenkov = playerPool.find((row) => normalizeName(row.name).includes("vezenkov"))!.id;
    data.players = data.players!.map((row) => (row.id === valanciunas ? { ...row, basketnews_position: "F" } : row));
    const db = fakePb({ data, uniqueIndexes: unique });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-04T12:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource());

    const rows = new Map(db.rows("players").map((row) => [row.id, row]));
    expect(rows.get(valanciunas)).toMatchObject({ basketnews_position: "F", basketnews_id: expect.stringMatching(/^[a-f0-9]{24}$/) });
    expect(rows.get(vezenkov)!.basketnews_position).toBe("F");
    expect(db.rows("players").filter((row) => row.basketnews_position === "C").length).toBeGreaterThan(20);
  });
});

describe("BasketNews registration and independent roster recovery", () => {
  const publicRound = () => fixture.teams.map((team) => ({ ...structuredClone(fixture.lineups[`${team.id}:2`]!), fantasyTeamId: team.id, fantasyRound: 3 }));

  it("records a leave-and-return transfer sequence after an unchanged roster was already verified", async () => {
    const db = fakePb({ data: leagueDb(), uniqueIndexes: unique });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-20T10:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    const league = publicRound();
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-21T10:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource(false, { league }));
    const before = structuredClone(db.rows("roster_memberships"));
    const held = new Set(before.filter((row) => !row.to_date).map((row) => row.player));
    const free = db.rows("players").find((row) => row.basketnews_id && !held.has(row.id))!;
    const own = league.find((row) => row.fantasyTeamId === OWN_TEAM)!;
    const original = own.players[0]!.playerId;
    const event = (id: string, out: string, into: string, at: string) => ({ id, type: "free_agent", status: "accepted", createdAt: at, updatedAt: at,
      offer: { fantasyTeamId: OWN_TEAM, players: [{ playerId: out }] }, request: { fantasyTeamId: null, players: [{ playerId: into }] } });
    const source: BasketNewsSource = { ...capturedSource(false, { league }),
      transfers: async () => [event("roundtrip1", original, String(free.basketnews_id), "2026-10-21T10:01:00Z"), event("roundtrip2", String(free.basketnews_id), original, "2026-10-21T10:02:00Z")],
      playerPool: async () => [{ id: String(free.basketnews_id), firstName: "Pass", lastName: "Through", jersey: "", position: "F", club: { id: "source-club", name: "Source club" } }],
    };
    const count = db.rows("transactions").length;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-21T11:00:00Z"));
      await processBasketNewsJobs(db.client, "session=test", source);
      expect(db.rows("fantasy_syncs").at(-1)?.status).toBe("applied");
      expect(db.rows("transactions")).toHaveLength(count + 4);
      expect(db.rows("roster_memberships")).toEqual(before);
    }
    expect(db.rows("transactions").slice(-4).map((row) => row.source_event_id)).toEqual(["roundtrip1", "roundtrip1", "roundtrip2", "roundtrip2"]);
  });

  it("keeps an unknown player actionable until approved, then automatically recovers the complete roster batch", async () => {
    const { basketNewsPlayer } = await import("./client");
    const { approveSourcePlayer } = await import("./registrations");
    const koloko = JSON.parse(readFileSync(new URL("../../../tests/fixtures/basketnews-koloko.json", import.meta.url), "utf8"));
    const db = fakePb({ data: leagueDb(), uniqueIndexes: unique });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-20T10:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    const league = publicRound();
    const own = league.find((row) => row.fantasyTeamId === OWN_TEAM)!;
    const last = own.players.at(-1)!;
    const departure = last.playerId;
    own.players[own.players.length - 1] = { ...last, playerId: koloko.id, player: koloko };
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-21T10:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource(false, { league }));
    expect(db.rows("fantasy_syncs").at(-1)?.status).toBe("blocked");
    expect(db.rows("source_player_questions")).toHaveLength(1);
    expect(db.rows("leagues")[0]?.basketnews_roster_round).toBe(3);
    expect(db.rows("players").some((row) => row.basketnews_id === koloko.id)).toBe(false);
    const playerId = await approveSourcePlayer(db.client, { leagueId: LEAGUE, season: "E2026", userId: "owner", sourceId: koloko.id, freshPool: [basketNewsPlayer(koloko)] });
    await processBasketNewsJobs(db.client, "session=test", capturedSource(false, { league }));
    expect(db.rows("fantasy_syncs").at(-1)?.status).toBe("applied");
    expect(db.rows("leagues")[0]?.basketnews_roster_round).toBe(4);
    const active = db.rows("roster_memberships").filter((row) => !row.to_date);
    expect(active).toHaveLength(117);
    expect(active.find((row) => row.player === playerId)).toMatchObject({ member: "ownmember", from_round: 4 });
    const oldId = db.rows("players").find((row) => row.basketnews_id === departure)!.id;
    expect(active.some((row) => row.player === oldId)).toBe(false);
    const transactionCount = db.rows("transactions").length;
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-21T11:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource(false, { league }));
    expect(db.rows("transactions")).toHaveLength(transactionCount);
  });

  it("applies public rosters despite a historical private-session failure and retains official scores", async () => {
    const db = fakePb({ data: leagueDb(), uniqueIndexes: unique });
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-20T10:00:00Z"));
    await processBasketNewsJobs(db.client, "session=test", capturedSource());
    const old = db.rows("round_lineups").find((row) => row.round === 3)!;
    old.basketnews_result = { ...(old.basketnews_result as object), final: false };
    const score = JSON.stringify(old.basketnews_result);
    const league = publicRound();
    const a = league[0]!.players.at(-1)!;
    const b = league[1]!.players.at(-1)!;
    league[0]!.players[12] = { ...a, playerId: b.playerId, player: b.player };
    league[1]!.players[12] = { ...b, playerId: a.playerId, player: a.player };
    await queueBasketNewsSync(db.client, LEAGUE, new Date("2026-10-21T10:00:00Z"));
    await processBasketNewsJobs(db.client, "expired", capturedSource(true, { league }));
    expect(db.rows("fantasy_syncs").at(-1)).toMatchObject({ status: "failed" });
    expect(String(db.rows("fantasy_syncs").at(-1)?.message)).toContain("Rosters: through round 4");
    expect(db.rows("leagues")[0]?.basketnews_roster_round).toBe(4);
    expect(JSON.stringify(old.basketnews_result)).toBe(score);
    const playerId = db.rows("players").find((row) => row.basketnews_id === a.playerId)!.id;
    const member = db.rows("league_members").find((row) => row.basketnews_team_id === league[1]!.fantasyTeamId)!.id;
    expect(db.rows("roster_memberships").find((row) => row.player === playerId && !row.to_date)?.member).toBe(member);
  });
});
