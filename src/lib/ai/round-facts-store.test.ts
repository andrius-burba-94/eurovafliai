import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import { buildRoundFacts } from "./round-facts";
import { readRoundFactsInput } from "./round-facts-store";

const NOW = Date.parse("2026-10-09T12:00:00Z");

function fixture(round: number, played: boolean, code: number) {
  return {
    id: `f${code}`,
    season: "E2026",
    game_code: code,
    round,
    phase: "RS",
    local_club: "AAA",
    road_club: "BBB",
    played,
    local_score: played ? 80 : 0,
    road_score: played ? 70 : 0,
    utc_date: `2026-10-0${round} 18:00:00.000Z`,
  };
}

function stat(player: string, round: number, fantasy: number, club = "AAA") {
  return {
    id: `s_${player}_${round}`,
    player,
    season: "E2026",
    game_code: round,
    round,
    phase: "RS",
    club_code: club,
    team_score: club === "AAA" ? 80 : 70,
    opponent_score: club === "AAA" ? 70 : 80,
    time_played: 1500,
    points: 12,
    reb_total: 5,
    assists: 2,
    pir: Math.round(fantasy / 10),
    fantasy_pts: fantasy,
    basketnews_raw_pts: fantasy * 10,
    started: round === 2 ? "yes" : "",
  };
}

function db(over: Partial<FakeDb> = {}): FakeDb {
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
    standings_snapshots: [1, 2].map((round) => ({
      id: `snap${round}`,
      league: "L1",
      season: "E2026",
      round,
      phase: "RS",
      table: [
        { memberId: "m1", totalHundredths: 3000 * round, roundHundredths: 3000 },
        { memberId: "m2", totalHundredths: 2000 * round, roundHundredths: 2000 },
      ],
    })),
    fixtures: [fixture(1, true, 1), fixture(2, true, 2), fixture(3, false, 3)],
    roster_memberships: [
      { id: "w1", league: "L1", member: "m1", player: "p1", from_round: 1, to_round: 0, to_date: "" },
      { id: "w2", league: "L1", member: "m2", player: "p2", from_round: 1, to_round: 0, to_date: "" },
    ],
    round_lineups: [],
    transactions: [],
    player_game_stats: [stat("p1", 1, 300), stat("p1", 2, 300), stat("p2", 1, 200, "BBB"), stat("p2", 2, 200, "BBB")],
    players: [
      { id: "p1", name: "Ace, Aaron", position: "G", club_code: "AAA", status: "" },
      { id: "p2", name: "Base, Bruno", position: "C", club_code: "BBB", status: "injured" },
    ],
    player_news: [{ id: "n1", source: "rotowire", source_key: "k", player: "p2", status: "injured", body_part: "Knee", published: "2026-10-01" }],
    ...over,
  };
}

const read = (data: FakeDb, round?: number) =>
  readRoundFactsInput(fakePb({ data }).client, { leagueId: "L1", season: "E2026", now: NOW, ...(round ? { round } : {}) });

describe("readRoundFactsInput", () => {
  it("reads the latest finished round and the one coming next", async () => {
    const result = await read(db());
    if (!result.ok) throw new Error(result.reason);
    expect(result.input.round).toBe(2);
    expect(result.input.nextRound).toBe(3);
    expect(result.input.ruleset).toBe("euroleague");
    expect(result.input.games.find((game) => game.player === "p1" && game.round === 2)?.started).toBe("yes");
    expect(result.input.members).toEqual([
      { id: "m1", teamName: "Einikio Kabliai", userName: "Andrius" },
      { id: "m2", teamName: "", userName: "Jonas" },
    ]);
    // A team with no name is read by its owner's name, the way the league sees it.
    expect(result.teamNames).toEqual({ m1: "Einikio Kabliai", m2: "Jonas" });
    expect(result.input.news).toEqual([{ player: "p2", status: "injured", bodyPart: "Knee", published: "2026-10-01" }]);
  });

  it("feeds a sheet the builder accepts", async () => {
    const result = await read(db());
    if (!result.ok) throw new Error(result.reason);
    const built = buildRoundFacts(result.input);
    expect(built.ok).toBe(true);
  });

  it("refuses a round that still has a game to play", async () => {
    const data = db({ fixtures: [fixture(1, true, 1), fixture(2, false, 2)] });
    await expect(read(data, 2)).resolves.toEqual({ ok: false, reason: "round 2 is not finished" });
  });

  it("refuses a league outside its season", async () => {
    const data = db({ leagues: [{ id: "L1", name: "x", status: "drafting", settings: {} }] });
    await expect(read(data)).resolves.toEqual({ ok: false, reason: "the league is in drafting, not its season" });
  });

  it("refuses a BasketNews league before its first sync", async () => {
    const data = db({ leagues: [{ id: "L1", name: "x", status: "season", basketnews_team_id: "t1", basketnews_league_id: "" }] });
    await expect(read(data)).resolves.toEqual({ ok: false, reason: "the BasketNews league has not synced yet" });
  });

  it("refuses a BasketNews round its source has not finalised for every team", async () => {
    const result = (memberId: string, final: boolean) => ({
      id: `rl_${memberId}`,
      league: "L1",
      member: memberId,
      season: "E2026",
      round: 2,
      basketnews_result: { final, totalHundredths: 1, calculatedHundredths: 1, players: [] },
    });
    const data = db({
      leagues: [{ id: "L1", name: "x", status: "season", basketnews_team_id: "t1", basketnews_league_id: "bl1" }],
      round_lineups: [result("m1", true), result("m2", false)],
    });
    await expect(read(data)).resolves.toEqual({ ok: false, reason: "BasketNews has not finalised round 2 for every team" });

    const final = db({
      leagues: [{ id: "L1", name: "x", status: "season", basketnews_team_id: "t1", basketnews_league_id: "bl1" }],
      round_lineups: [result("m1", true), result("m2", true)],
    });
    await expect(read(final)).resolves.toMatchObject({ ok: true, input: { ruleset: "basketnews" } });
  });

  it("says so when no round has finished", async () => {
    const data = db({ standings_snapshots: [] });
    await expect(read(data)).resolves.toEqual({ ok: false, reason: "no round has finished yet" });
  });
});
