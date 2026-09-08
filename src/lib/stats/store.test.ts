import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import type { StatPlan, StatRowFields } from "./plan";
import {
  applyStatPlan,
  markStatBatchApplied,
  readExistingStats,
  readStatPlayers,
  readStoredGameCodes,
  recordStatBatch,
} from "./store";

/**
 * The box-score store's failure-recovery story, exercised against the fake
 * that enforces `unique(player, season, game_code)`. Every claim in the
 * module's header — batch first, rows independent, a lost race becomes an
 * update, one bad row does not cost the rest, the batch verdict is tolerant —
 * has a test here.
 */

const SEASON = "E2026";

function row(over: Partial<StatRowFields> = {}): StatRowFields {
  return {
    player: "p1",
    season: SEASON,
    game_code: 1,
    round: 1,
    phase: "RS",
    club_code: "ZAL",
    team_score: 80,
    opponent_score: 70,
    time_played: 1200,
    points: 10,
    fgm2: 2,
    fga2: 4,
    fgm3: 1,
    fga3: 2,
    ftm: 3,
    fta: 4,
    reb_off: 1,
    reb_def: 2,
    reb_total: 3,
    assists: 4,
    steals: 1,
    turnovers: 2,
    blocks_for: 0,
    blocks_against: 1,
    fouls_committed: 2,
    fouls_drawn: 3,
    plus_minus: 5,
    pir: 12,
    fantasy_pts: 14,
    ...over,
  };
}

function plan(over: Partial<StatPlan> = {}): StatPlan {
  return {
    creates: [],
    updates: [],
    unchanged: 0,
    unmatched: [],
    games: 1,
    rounds: [1],
    ...over,
  };
}

describe("readStatPlayers", () => {
  it("asks for only the three fields it needs, and empties a missing code", async () => {
    const { client } = fakePb({
      data: {
        players: [
          { id: "p1", name: "A", person_code: "001", club_code: "ZAL" },
          { id: "p2", name: "B", club_code: "ZAL" },
        ],
      },
    });
    expect(await readStatPlayers(client)).toEqual([
      { id: "p1", personCode: "001", name: "A" },
      { id: "p2", personCode: "", name: "B" },
    ]);
  });
});

describe("readExistingStats / readStoredGameCodes", () => {
  const stored = [
    { id: "s1", ...row({ game_code: 1 }) },
    { id: "s2", ...row({ game_code: 2, player: "p2" }) },
    { id: "s3", ...row({ game_code: 3 }) },
    { id: "s4", ...row({ game_code: 1, season: "E2025" }) },
  ];

  it("reads only the batch's games for the season", async () => {
    const { client } = fakePb({ data: { player_game_stats: stored } });
    const rows = await readExistingStats(client, SEASON, [1, 2, 2]);
    expect(rows.map((each) => each.id).sort()).toEqual(["s1", "s2"]);
  });

  it("reads nothing for no games, and ignores codes that are not integers", async () => {
    const { client } = fakePb({ data: { player_game_stats: stored } });
    expect(await readExistingStats(client, SEASON, [])).toEqual([]);
    expect(await readExistingStats(client, SEASON, [1.5, NaN])).toEqual([]);
  });

  it("names the games with anything stored", async () => {
    const { client } = fakePb({ data: { player_game_stats: stored } });
    expect([...(await readStoredGameCodes(client, SEASON))].sort()).toEqual([
      1, 2, 3,
    ]);
    expect([...(await readStoredGameCodes(client, "E2025"))]).toEqual([1]);
  });
});

describe("applyStatPlan", () => {
  it("creates, updates and stamps every row with the batch", async () => {
    const fake = fakePb({
      data: {
        player_game_stats: [{ id: "old", ...row({ player: "p2" }), points: 1 }],
      },
    });

    const result = await applyStatPlan(
      fake.client,
      plan({
        creates: [{ fields: row(), line: 2 }],
        updates: [{ id: "old", fields: row({ player: "p2" }), changes: [], line: 3 }],
        unchanged: 5,
      }),
      "batch_1",
    );

    expect(result).toEqual({
      created: 1,
      updated: 1,
      unchanged: 5,
      failures: [],
    });
    for (const stored of fake.rows("player_game_stats")) {
      expect(stored.import_batch).toBe("batch_1");
    }
  });

  it("turns a create that lost the index race into an update", async () => {
    let raced = false;
    const fake = fakePb({
      data: { player_game_stats: [] },
      hooks: {
        beforeCreate(collection, data) {
          if (collection === "player_game_stats" && !raced) {
            raced = true;
            fake.rows("player_game_stats").push({
              id: "theirs",
              ...(data as StatRowFields),
              points: 0,
            });
          }
        },
      },
    });

    const result = await applyStatPlan(
      fake.client,
      plan({ creates: [{ fields: row({ points: 10 }), line: 2 }] }),
      "batch_1",
    );

    expect(result).toMatchObject({ created: 0, updated: 1, failures: [] });
    expect(fake.rows("player_game_stats")).toHaveLength(1);
    expect(fake.rows("player_game_stats")[0]).toMatchObject({
      id: "theirs",
      points: 10,
      import_batch: "batch_1",
    });
  });

  it("reports a refused row and keeps going", async () => {
    const fake = fakePb({
      data: { player_game_stats: [] },
      hooks: {
        beforeCreate(_collection, data) {
          if (data.player === "bad") throw new Error("no such player");
        },
      },
    });

    const result = await applyStatPlan(
      fake.client,
      plan({
        creates: [
          { fields: row({ player: "bad" }), line: 2 },
          { fields: row({ player: "good" }), line: 3 },
        ],
        updates: [{ id: "missing", fields: row(), changes: [], line: 4 }],
      }),
      "batch_1",
    );

    expect(result.created).toBe(1);
    expect(result.updated).toBe(0);
    expect(result.failures).toHaveLength(2);
    expect(result.failures[0]).toMatch(/^Line 2: .*no such player/);
    expect(result.failures[1]).toMatch(/^Line 4: /);
  });
});

describe("recordStatBatch / markStatBatchApplied", () => {
  it("stores the batch unapplied first and marks it applied last", async () => {
    const fake = fakePb({ data: { stat_imports: [] } });

    const batch = await recordStatBatch(fake.client, {
      source: "csv",
      season: SEASON,
      rows: 3,
      plan: plan(),
      log: "x".repeat(30_000),
    });

    expect(batch.applied).toBe(false);
    const stored = fake.rows("stat_imports")[0];
    expect(stored).toMatchObject({
      id: batch.id,
      applied: false,
      created_rows: 0,
    });
    // The log is bounded so a huge paste cannot grow the audit row without limit.
    expect((stored?.log as string).length).toBe(20_000);

    await markStatBatchApplied(
      fake.client,
      batch.id,
      { created: 2, updated: 1, unchanged: 0, failures: ["Line 4: nope"] },
      "done",
    );
    expect(fake.rows("stat_imports")[0]).toMatchObject({
      applied: true,
      created_rows: 2,
      updated_rows: 1,
      log: "done",
    });
  });

  it("tolerates a batch that cannot be marked", async () => {
    const fake = fakePb({ data: { stat_imports: [] } });
    await expect(
      markStatBatchApplied(
        fake.client,
        "gone",
        { created: 0, updated: 0, unchanged: 0, failures: [] },
        "",
      ),
    ).resolves.toBeUndefined();
  });
});
