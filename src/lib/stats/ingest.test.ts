import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import golden from "./fixtures/e2025-boxscores.json";
import { ingestFinishedGames, summariseIngest } from "./ingest";

/**
 * One ingest pass, against the strict fake PocketBase and the golden fixture
 * served as the feed.
 *
 * The fake enforces the real `unique(player, season, game_code)` index, which
 * is what makes the idempotence tests here mean something: a fake that stored
 * the same game twice would let "re-running a pass is safe" pass while being
 * false.
 */

type GoldenGame = (typeof golden.games)[number];
const games = golden.games as GoldenGame[];

const scheduleBody = (over: Record<string, unknown>[] = []) => ({
  data: games.map((game, index) => ({
    gameCode: game.gameCode,
    round: game.round,
    played: true,
    utcDate: game.date,
    phaseType: { code: game.phase },
    local: { club: { code: game.localClub }, score: game.localScore },
    road: { club: { code: game.roadClub }, score: game.roadScore },
    ...(over[index] ?? {}),
  })),
});

const boxBody = (game: GoldenGame) => {
  const side = (club: string) => ({
    players: game.rows
      .filter((row) => row.club === club)
      .map((row) => ({
        player: { person: { code: row.personCode, alias: row.name } },
        stats: { ...row.stats, valuation: row.valuation },
      })),
  });
  return { local: side(game.localClub), road: side(game.roadClub) };
};

function feed(schedule: unknown = scheduleBody()) {
  const asked: string[] = [];
  const doFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    if (url.includes("/games?")) return Response.json(schedule);
    const code = /\/games\/(\d+)\/stats/.exec(url)?.[1];
    const game = games.find((entry) => String(entry.gameCode) === code);
    if (!game) return new Response("nope", { status: 404 });
    return Response.json(boxBody(game));
  }) as typeof fetch;
  return { doFetch, asked };
}

/** Every person code in the fixture, planted in the pool. */
function poolFor(codes: string[]) {
  return codes.map((code, index) => ({
    id: `players_${index}`,
    name: `Player ${code}`,
    person_code: code,
  }));
}

const allCodes = [
  ...new Set(games.flatMap((game) => game.rows.map((row) => row.personCode))),
];

describe("ingestFinishedGames", () => {
  it("imports the outstanding games and scores every line", async () => {
    const { client, db } = fakePb({ data: { players: poolFor(allCodes) } });
    const { doFetch, asked } = feed();

    const report = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
    });

    expect(report.played).toBe(7);
    expect(report.outstanding).toBe(7);
    expect(report.attempted).toBe(7);
    expect(report.created).toBe(168);
    expect(report.unmatched).toBe(0);
    expect(report.checkedAgainstPir).toBe(168);
    expect(report.problems).toEqual([]);
    expect(db.player_game_stats).toHaveLength(168);

    // One schedule request plus one per game — nothing per player.
    expect(asked.filter((url) => url.includes("/games?"))).toHaveLength(1);
    expect(asked.filter((url) => url.includes("/stats"))).toHaveLength(7);

    // A spot check against the Euroleague's own number, through the whole
    // pass rather than through the scorer alone: 7 points, PIR 3, on a win.
    const beaubois = db.player_game_stats!.find(
      (row) => row.game_code === 1 && row.points === 7 && row.pir === 3,
    );
    expect(beaubois).toBeDefined();
    expect(beaubois!.fantasy_pts).toBe(33);
    expect(beaubois!.phase).toBe("RS");
  });

  it("stores an audit batch, applied, naming what it did", async () => {
    const { client, db } = fakePb({ data: { players: poolFor(allCodes) } });
    const { doFetch } = feed(scheduleBody().data.slice(0, 1));

    const report = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
    });

    expect(db.stat_imports).toHaveLength(1);
    const batch = db.stat_imports![0]!;
    expect(batch.id).toBe(report.batchId);
    expect(batch.source).toBe("api");
    expect(batch.applied).toBe(true);
    expect(batch.created_rows).toBe(24);
    expect(String(batch.log)).toContain("24 rows carried the feed's own PIR");
  });

  it("does nothing at all on a second pass — the whole point of the design", async () => {
    const { client, db, writes } = fakePb({ data: { players: poolFor(allCodes) } });
    const { doFetch } = feed();

    await ingestFinishedGames({ pb: client, season: "E2025", doFetch });
    const after = writes.length;

    const second = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
    });

    expect(second.outstanding).toBe(0);
    expect(second.attempted).toBe(0);
    expect(second.created).toBe(0);
    expect(second.batchId).toBeNull();
    expect(db.player_game_stats).toHaveLength(168);
    // Not one write, and no `stat_imports` row for a pass that had nothing to
    // do — otherwise a quiet season would bury the batches that matter.
    expect(writes.length).toBe(after);
    // Still the one batch the first pass wrote, not a second, empty one.
    expect(db.stat_imports).toHaveLength(1);
  });

  it("finishes exactly what a pass that died halfway left behind", async () => {
    const { client, db } = fakePb({ data: { players: poolFor(allCodes) } });
    const { doFetch } = feed();

    // A pass capped at two games, as if the tick had been cut short.
    const first = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
      maxGames: 2,
    });
    expect(first.attempted).toBe(2);
    expect(first.created).toBe(48);
    expect(first.outstanding).toBe(7);

    const second = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
    });
    // Exactly the remainder: five games, and nothing rewritten.
    expect(second.outstanding).toBe(5);
    expect(second.attempted).toBe(5);
    expect(second.created).toBe(120);
    expect(second.updated).toBe(0);
    expect(second.unchanged).toBe(0);
    expect(db.player_game_stats).toHaveLength(168);
  });

  it("caps a pass, and takes the oldest games first", async () => {
    const { client, db } = fakePb({ data: { players: poolFor(allCodes) } });
    const { doFetch } = feed();

    const report = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
      maxGames: 3,
    });

    expect(report.attempted).toBe(3);
    // Oldest first, so a half-done backfill leaves a prefix rather than a
    // scatter with holes in it.
    expect([
      ...new Set(db.player_game_stats!.map((row) => row.game_code)),
    ]).toEqual([1, 2, 3]);
  });

  it("skips an unplayed game entirely, without asking for its box score", async () => {
    const { client, db } = fakePb({ data: { players: poolFor(allCodes) } });
    const { doFetch, asked } = feed(
      scheduleBody([
        { played: false, local: { club: { code: "IST" }, score: 0 }, road: { club: { code: "TEL" }, score: 0 } },
      ]),
    );

    const report = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
    });

    expect(report.played).toBe(6);
    expect(asked.some((url) => url.includes("/games/1/stats"))).toBe(false);
    expect(db.player_game_stats!.some((row) => row.game_code === 1)).toBe(false);
  });

  it("reports an unmatched person code and stores every other line", async () => {
    // 4.2's input, produced by 4.3 rather than invented: the pool is missing
    // one player the feed named.
    const { client, db } = fakePb({
      data: {
        players: poolFor(
          allCodes.filter((code) => code !== games[0]!.rows[0]!.personCode),
        ),
      },
    });
    const { doFetch } = feed(scheduleBody().data.slice(0, 1));

    const report = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
    });

    expect(report.unmatched).toBe(1);
    expect(report.created).toBe(23);
    expect(db.player_game_stats).toHaveLength(23);
    expect(String(db.stat_imports![0]!.log)).toContain("No player with person code");
  });

  it("writes nothing, and no batch, when a game's box score is not ready", async () => {
    const { client, db } = fakePb({ data: { players: poolFor(allCodes) } });
    // Played, per the schedule, but 0–0 — which is how an unplayed game reads.
    const { doFetch } = feed({
      data: [
        {
          gameCode: 1,
          round: 1,
          played: true,
          phaseType: { code: "RS" },
          local: { club: { code: "IST" }, score: 0 },
          road: { club: { code: "TEL" }, score: 0 },
        },
      ],
    });

    const report = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
    });

    expect(report.created).toBe(0);
    expect(report.batchId).toBeNull();
    expect(report.problems[0]).toContain("level at 0");
    expect(db.player_game_stats ?? []).toHaveLength(0);
    expect(db.stat_imports ?? []).toHaveLength(0);
  });

  it("keeps a season's games separate from another season's", async () => {
    // `game_code` is unique *within* a season, and E2025 and E2026 both have a
    // game 1. Storing E2025 must not make E2026's game 1 look done.
    const { client, db } = fakePb({ data: { players: poolFor(allCodes) } });
    const { doFetch } = feed(scheduleBody().data.slice(0, 1));

    await ingestFinishedGames({ pb: client, season: "E2025", doFetch });
    const report = await ingestFinishedGames({
      pb: client,
      season: "E2026",
      doFetch,
    });

    expect(report.outstanding).toBe(1);
    expect(report.created).toBe(24);
    expect(db.player_game_stats).toHaveLength(48);
  });

  it("lets a schedule failure throw, before anything is recorded", async () => {
    const { client, db } = fakePb({ data: { players: poolFor(allCodes) } });
    const doFetch = (async () =>
      new Response("down", { status: 404, statusText: "Not Found" })) as typeof fetch;

    await expect(
      ingestFinishedGames({ pb: client, season: "E2025", doFetch }),
    ).rejects.toThrow(/404/);
    // No batch claiming an import that never ran.
    expect(db.stat_imports ?? []).toHaveLength(0);
  });
});

describe("summariseIngest", () => {
  it("says what a pass did in one line", async () => {
    const { client } = fakePb({ data: { players: poolFor(allCodes) } });
    const { doFetch } = feed(scheduleBody().data.slice(0, 1));
    const report = await ingestFinishedGames({
      pb: client,
      season: "E2025",
      doFetch,
    });
    expect(summariseIngest(report)).toBe(
      "stats · E2025 · 1 game(s), 24 new · 1 outstanding",
    );
  });
});
