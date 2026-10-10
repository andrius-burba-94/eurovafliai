import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import { refreshOutlooks } from "./store";

const NOW = new Date("2026-10-10T12:00:00Z");

function fixture(code: number, round: number, played: boolean, season = "E2026") {
  return {
    id: `f${season}${code}`,
    season,
    game_code: code,
    round,
    phase: "RS",
    local_club: "AAA",
    road_club: "BBB",
    played,
    local_score: played ? 80 : 0,
    road_score: played ? 80 : 0,
    utc_date: "",
  };
}

function stat(player: string, club: string, code: number, round: number, season = "E2026") {
  return {
    id: `s${season}${player}${code}`,
    player,
    season,
    game_code: code,
    round,
    phase: "RS",
    club_code: club,
    team_score: 80,
    opponent_score: 80,
    time_played: 1200,
    pir: 10,
    fantasy_pts: 100,
    basketnews_raw_pts: 1050,
    started: "yes",
  };
}

function db(over: Partial<FakeDb> = {}): FakeDb {
  return {
    leagues: [
      { id: "fc", status: "season", basketnews_team_id: "" },
      { id: "bn", status: "season", basketnews_team_id: "77" },
      { id: "old", status: "setup", basketnews_team_id: "" },
    ],
    players: [
      { id: "a", club_code: "AAA" },
      { id: "b", club_code: "BBB" },
      { id: "new", club_code: "AAA" },
    ],
    fixtures: [fixture(1, 1, true), fixture(2, 2, true), fixture(3, 3, false), fixture(4, 4, false)],
    player_game_stats: [stat("a", "AAA", 1, 1), stat("b", "BBB", 1, 1), stat("a", "AAA", 2, 2), stat("b", "BBB", 2, 2)],
    player_outlooks: [],
    ...over,
  };
}

const uniqueIndexes = { player_outlooks: [["season", "ruleset", "player"]] };

describe("refreshOutlooks", () => {
  it("writes one row per player with a figure, for each ruleset a league in season plays", async () => {
    const { client, db: data } = fakePb({ data: db(), uniqueIndexes });

    const report = await refreshOutlooks(client, { season: "E2026", now: NOW });

    expect(report).toEqual({ rulesets: ["euroleague", "basketnews"], written: 4, unchanged: 0 });
    const rows = data.player_outlooks!;
    expect(rows.map((row) => `${row.ruleset}:${row.player}`).sort()).toEqual([
      "basketnews:a",
      "basketnews:b",
      "euroleague:a",
      "euroleague:b",
    ]);
    // 0.5 PIR a minute × 20 minutes × 1.05 for an even game's half bonus.
    expect(rows.find((row) => row.ruleset === "euroleague" && row.player === "a")).toMatchObject({
      season: "E2026",
      outlook_5: 1050,
      games_ahead: 2,
      role: "starter",
      games_in_role: 2,
      base_source: "current",
      run_5: "even",
      computed_at: NOW.toISOString(),
    });
  });

  it("writes nothing on a second pass over the same data", async () => {
    const { client, writes } = fakePb({ data: db(), uniqueIndexes });
    await refreshOutlooks(client, { season: "E2026", now: NOW });
    const after = writes.length;

    const again = await refreshOutlooks(client, { season: "E2026", now: new Date("2026-10-10T12:15:00Z") });

    expect(again).toMatchObject({ written: 0, unchanged: 4 });
    expect(writes.length).toBe(after);
  });

  it("heals a pass that died halfway: the next one writes what is missing or stale", async () => {
    const { client, db: data } = fakePb({ data: db(), uniqueIndexes });
    await refreshOutlooks(client, { season: "E2026", now: NOW });
    data.player_outlooks = data.player_outlooks!.slice(1);
    data.player_outlooks[0]!.outlook_5 = 1;

    const report = await refreshOutlooks(client, { season: "E2026", now: NOW });

    expect(report).toMatchObject({ written: 2, unchanged: 2 });
    expect(data.player_outlooks).toHaveLength(4);
  });

  it("falls back to last season's lines for a player without a game this season", async () => {
    const data = db({
      fixtures: [...db().fixtures!, fixture(1, 1, true, "E2025")],
      player_game_stats: [...db().player_game_stats!, stat("new", "AAA", 1, 1, "E2025")],
    });
    const { client, db: stored } = fakePb({ data, uniqueIndexes });

    await refreshOutlooks(client, { season: "E2026", now: NOW });

    expect(stored.player_outlooks!.find((row) => row.ruleset === "euroleague" && row.player === "new")).toMatchObject({
      base_source: "last",
      games_in_role: 0,
    });
  });

  it("does nothing when no league is in season", async () => {
    const { client, writes } = fakePb({
      data: db({ leagues: [{ id: "old", status: "setup", basketnews_team_id: "" }] }),
      uniqueIndexes,
    });
    expect(await refreshOutlooks(client, { season: "E2026", now: NOW })).toEqual({ rulesets: [], written: 0, unchanged: 0 });
    expect(writes).toEqual([]);
  });
});
