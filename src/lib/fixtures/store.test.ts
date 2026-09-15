import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import {
  scheduleRowsFrom,
  upsertFixtures,
  type FixtureRecord,
} from "./store";

/**
 * Storing the schedule — slice 10.7.
 *
 * Driven through `fake-pb`, which enforces `unique(season, game_code)` the way
 * the migration declares it. That is the point of using it rather than a mock: a
 * test of "running the pass twice is safe" is worthless against a fake that
 * would happily store the same game again.
 */

const SEASON = "E2026";

function feedGame(over: Partial<Parameters<typeof upsertFixtures>[2][number]> = {}) {
  return {
    gameCode: 1,
    round: 1,
    phase: "RS",
    played: false,
    localClub: "AAA",
    roadClub: "BBB",
    localScore: 0,
    roadScore: 0,
    utcDate: "2026-10-01T18:00:00Z",
    ...over,
  };
}

describe("upsertFixtures", () => {
  it("stores a schedule it has never seen", async () => {
    const pb = fakePb({ data: { fixtures: [] } });
    const applied = await upsertFixtures(pb.client, SEASON, [
      feedGame({ gameCode: 2, round: 1 }),
      feedGame({ gameCode: 1, round: 1 }),
    ]);

    expect(applied).toEqual({
      created: 2,
      updated: 0,
      unchanged: 0,
      failures: [],
    });
    // Oldest game first, so a pass that dies halfway leaves a prefix of the
    // season rather than a scatter through it.
    expect(pb.rows("fixtures").map((row) => row.game_code)).toEqual([1, 2]);
  });

  it("writes nothing at all on a quiet night", async () => {
    // The pass runs every fifteen minutes and the feed answers four hundred
    // unchanged rows between game nights. Rewriting them would churn `updated`
    // on every row every quarter of an hour.
    const pb = fakePb({ data: { fixtures: [] } });
    const games = [feedGame({ gameCode: 1 }), feedGame({ gameCode: 2 })];
    await upsertFixtures(pb.client, SEASON, games);
    const writes = pb.writes.length;

    const again = await upsertFixtures(pb.client, SEASON, games);
    expect(again).toEqual({
      created: 0,
      updated: 0,
      unchanged: 2,
      failures: [],
    });
    expect(pb.writes.length).toBe(writes);
  });

  it("updates the game that has just been played", async () => {
    const pb = fakePb({ data: { fixtures: [] } });
    await upsertFixtures(pb.client, SEASON, [feedGame({ gameCode: 7 })]);

    const applied = await upsertFixtures(pb.client, SEASON, [
      feedGame({ gameCode: 7, played: true, localScore: 88, roadScore: 80 }),
    ]);
    expect(applied.updated).toBe(1);
    expect(pb.rows("fixtures")).toHaveLength(1);
    expect(pb.rows("fixtures")[0]).toMatchObject({
      played: true,
      local_score: 88,
      road_score: 80,
    });
  });

  it("keeps another season's identical game code", async () => {
    // `game_code` is only unique *within* a season — E2025 and E2026 both
    // number from 1 — so the index is composite and so is the comparison.
    const pb = fakePb({ data: { fixtures: [] } });
    await upsertFixtures(pb.client, "E2025", [feedGame({ gameCode: 1 })]);
    const applied = await upsertFixtures(pb.client, SEASON, [
      feedGame({ gameCode: 1 }),
    ]);

    expect(applied.created).toBe(1);
    expect(pb.rows("fixtures")).toHaveLength(2);
  });

  it("treats a lost race as the outcome it wanted", async () => {
    // Two passes at once: the row lands between our read and our write, the
    // index refuses the copy, and the pass reads it back instead of failing.
    // The interesting half is that the raced row is *stale* — it says the game
    // is unplayed and we know the score — so it must be corrected, not counted
    // as unchanged.
    const pb = fakePb({
      data: { fixtures: [] },
      hooks: {
        beforeCreate(collection, data) {
          if (collection !== "fixtures" || data.played !== true) return;
          pb.rows("fixtures").push({
            id: "raced",
            season: SEASON,
            game_code: 9,
            round: 3,
            phase: "RS",
            local_club: "AAA",
            road_club: "BBB",
            played: false,
            local_score: 0,
            road_score: 0,
            utc_date: "2026-10-01T18:00:00Z",
          });
        },
      },
    });

    const applied = await upsertFixtures(pb.client, SEASON, [
      feedGame({ gameCode: 9, round: 3, played: true, localScore: 91, roadScore: 77 }),
    ]);

    expect(applied).toMatchObject({ created: 0, updated: 1, failures: [] });
    expect(pb.rows("fixtures")).toHaveLength(1);
    expect(pb.rows("fixtures")[0]).toMatchObject({
      id: "raced",
      played: true,
      local_score: 91,
    });
  });

  it("reports a game it could not store and stores the rest", async () => {
    // One row failing is not a reason to have none of them: the schedule is
    // four hundred independent games and the next pass re-plans the remainder.
    const pb = fakePb({
      data: { fixtures: [] },
      hooks: {
        beforeCreate(collection, data) {
          if (collection === "fixtures" && data.game_code === 2) {
            throw new Error("nope");
          }
        },
      },
    });

    const applied = await upsertFixtures(pb.client, SEASON, [
      feedGame({ gameCode: 1 }),
      feedGame({ gameCode: 2 }),
      feedGame({ gameCode: 3 }),
    ]);

    expect(applied.created).toBe(2);
    expect(applied.failures).toHaveLength(1);
    expect(applied.failures[0]).toContain("game 2");
  });
});

describe("scheduleRowsFrom", () => {
  it("reads an unset score as nought and an unset kickoff as null", () => {
    // PocketBase omits a field it was never given, and the pure module's two
    // sorts both depend on knowing which of those means "no time published".
    const stored = [
      {
        id: "a",
        season: SEASON,
        game_code: 4,
        round: 2,
        phase: "RS",
        local_club: "AAA",
        road_club: "BBB",
      },
    ] satisfies FixtureRecord[];

    expect(scheduleRowsFrom(stored)).toEqual([
      {
        gameCode: 4,
        round: 2,
        played: false,
        localClub: "AAA",
        roadClub: "BBB",
        localScore: 0,
        roadScore: 0,
        utcDate: null,
      },
    ]);
  });
});
