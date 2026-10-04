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
import { snapshotRowsFrom } from "@/lib/stats/standings";
import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import {
  BasketNewsSessionExpired,
  readBasketNewsLeague,
  readBasketNewsLineup,
  readBasketNewsScore,
  readBasketNewsTeamReference,
  readBasketNewsTeams,
} from "./client";
import { processBasketNewsJobs } from "./jobs";
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

function capturedSource(expired = false): BasketNewsSource {
  const doFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    const request = JSON.parse(String(init?.body)) as { query: string; variables: Record<string, string | number> };
    const { query, variables } = request;
    let key: string;
    let value: unknown;
    if (query.includes("fantasyTeamRecordFromClient")) {
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
      value = fixture.lineups[`${variables.team}:${round}`] ?? null;
    } else {
      key = "fantasyTeamScoreRecordFromClient";
      value = fixture.scores[`${variables.team}:${variables.round}`] ?? null;
    }
    return new Response(JSON.stringify({ data: { [key]: value } }), { status: 200 });
  }) as typeof fetch;
  return {
    teamReference: (id) => readBasketNewsTeamReference(id, doFetch),
    league: (id, competition) => readBasketNewsLeague(id, competition, doFetch),
    teams: (id) => readBasketNewsTeams(id, doFetch),
    lineup: (team, round, competition, cookie) => readBasketNewsLineup(team, round, competition, cookie, doFetch),
    score: (team, round, competition) => readBasketNewsScore(team, round, competition, doFetch),
  };
}

function leagueDb(missingPlayer?: string): FakeDb {
  return {
    leagues: [{ id: LEAGUE, name: fixture.league.title, slug: "hostinger-cashiorai", season: "2026-27", status: "setup", commissioner: "owner", basketnews_team_id: OWN_TEAM, basketnews_league_id: "" }],
    users: [{ id: "owner", email: "owner@example.invalid", name: "Andrius" }],
    league_members: [{ id: "ownmember", league: LEAGUE, user: "owner", team_name: "Andrius", slug: "andrius-burba", draft_position: 0, basketnews_team_id: "" }],
    players: playerPool.filter((row) => row.id !== missingPlayer).map((row) => ({ ...row, position: "F", basketnews_id: "", basketnews_position: "", slug: "" })),
    fantasy_syncs: [], drafts: [], picks: [], roster_memberships: [], transactions: [], chat_messages: [],
    round_lineups: [], standings_snapshots: [], player_game_stats: [],
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
      return leaguePosition({ position: row.position as Position, basketnews_position: row.basketnews_position as Position }, true);
    };
    for (const row of db.rows("players").filter((player) => player.basketnews_id)) {
      expect(mappedPosition(row.id)).toBe(sourcePositions.get(String(row.basketnews_id)));
      expect(leaguePosition({ position: row.position as Position, basketnews_position: row.basketnews_position as Position }, false)).toBe("F");
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
    expect(navigation.flatMap((group) => group.items).some((item) => item.key === "matchday")).toBe(false);
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
});
