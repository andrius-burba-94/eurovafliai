import { describe, expect, it } from "vitest";

import {
  fetchGameBoxScore,
  fetchGameBoxScores,
  fetchSeasonSchedule,
  type ScheduledGame,
} from "./euroleague";
import golden from "./fixtures/e2025-boxscores.json";
import { scoreGame } from "./scoring";

/**
 * The fetcher, driven by the **committed golden fixture served as if it were
 * the feed**.
 *
 * That is the point of this file. A hand-written fake payload proves the code
 * can read a payload I invented; the fixture is 168 real player lines from
 * seven real E2025 games, with the Euroleague's own PIR on every one, so these
 * tests exercise the actual shape — including the parts I would not have
 * thought to fake, like a did-not-play line of nineteen zeros.
 */

type GoldenGame = (typeof golden.games)[number];
const games = golden.games as GoldenGame[];

/** The schedule the feed would send for these games. */
const scheduleBody = (over: Partial<Record<string, unknown>>[] = []) => ({
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

/** The box score the feed would send for one game. */
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

/** A `fetch` that answers from the fixture, and records what was asked. */
function feed({
  schedule = scheduleBody(),
  box = boxBody,
  fail,
}: {
  schedule?: unknown;
  box?: (game: GoldenGame) => unknown;
  fail?: (url: string) => Response | undefined;
} = {}) {
  const asked: string[] = [];
  const doFetch = (async (input: string | URL | Request) => {
    const url = String(input);
    asked.push(url);
    const failed = fail?.(url);
    if (failed) return failed;

    if (url.includes("/games?")) return Response.json(schedule);
    const code = /\/games\/(\d+)\/stats/.exec(url)?.[1];
    const game = games.find((entry) => String(entry.gameCode) === code);
    if (!game) return new Response("nope", { status: 404 });
    return Response.json(box(game));
  }) as typeof fetch;

  return { doFetch, asked };
}

const scheduled = (game: GoldenGame): ScheduledGame => ({
  gameCode: game.gameCode,
  round: game.round,
  phase: game.phase as ScheduledGame["phase"],
  played: true,
  localClub: game.localClub,
  roadClub: game.roadClub,
  localScore: game.localScore,
  roadScore: game.roadScore,
  utcDate: game.date,
});

describe("fetchSeasonSchedule", () => {
  it("reads the season's games, enveloped", async () => {
    const { doFetch, asked } = feed();
    const result = await fetchSeasonSchedule({ season: "E2025", doFetch });

    expect(result).toHaveLength(7);
    expect(asked).toEqual([
      "https://api-live.euroleague.net/v2/competitions/E/seasons/E2025/games?limit=500",
    ]);
    expect(result[0]).toMatchObject({
      gameCode: 1,
      round: 1,
      phase: "RS",
      played: true,
      localClub: "IST",
      roadClub: "TEL",
      localScore: 85,
      roadScore: 78,
    });
  });

  it("reads a bare array too, because this feed is inconsistent about it", async () => {
    // `/clubs` is enveloped and a club's `/people` is not; assuming either
    // shape for both is a documented trap in this feed.
    const { doFetch } = feed({ schedule: scheduleBody().data });
    expect(await fetchSeasonSchedule({ season: "E2025", doFetch })).toHaveLength(
      7,
    );
  });

  it("marks an unplayed game unplayed rather than dropping it", async () => {
    const { doFetch } = feed({
      schedule: scheduleBody([{ played: false, local: { club: { code: "RED" }, score: 0 }, road: { club: { code: "ZAL" }, score: 0 } }]),
    });
    const result = await fetchSeasonSchedule({ season: "E2026", doFetch });
    expect(result[0]!.played).toBe(false);
    expect(result[0]!.localScore).toBe(0);
  });

  it("derives a phase the feed did not name", async () => {
    const { doFetch } = feed({
      schedule: scheduleBody([{ phaseType: null, round: 44 }]),
    });
    const result = await fetchSeasonSchedule({ season: "E2025", doFetch });
    expect(result[0]!.phase).toBe("PO");
  });

  it("keeps reading when a field it does not use goes missing", async () => {
    // The deliberate trade recorded in `@/lib/euroleague/http`: a tolerant
    // schema over the fields we read, so drift elsewhere cannot stop an
    // unattended import. `referee1`, `venue` and `winner` are all absent here.
    const { doFetch } = feed({
      schedule: {
        data: [
          {
            gameCode: 1,
            round: 1,
            played: true,
            local: { club: { code: "IST" }, score: 85 },
            road: { club: { code: "TEL" }, score: 78 },
          },
        ],
      },
    });
    const result = await fetchSeasonSchedule({ season: "E2025", doFetch });
    expect(result[0]).toMatchObject({ gameCode: 1, phase: "RS" });
  });
});

describe("fetchGameBoxScore", () => {
  it("normalizes a real game into rows the plan can read", async () => {
    const game = games[0]!;
    const { doFetch } = feed();
    const result = await fetchGameBoxScore({
      season: "E2025",
      game: scheduled(game),
      doFetch,
    });

    expect(result.problems).toEqual([]);
    expect(result.rows).toHaveLength(24);
    // Every one carried the feed's own PIR, and every one agreed with ours.
    expect(result.checkedAgainstPir).toBe(24);
  });

  it("scores all 168 real lines the way the Euroleague did", async () => {
    const { doFetch } = feed();
    const { fetched, failed } = await fetchGameBoxScores({
      season: "E2025",
      games: games.map(scheduled),
      doFetch,
    });

    expect(failed).toEqual([]);
    const rows = fetched.flatMap((game) => game.rows);
    expect(rows).toHaveLength(168);
    expect(
      fetched.reduce((total, game) => total + game.checkedAgainstPir, 0),
    ).toBe(168);

    // And the win bonus went to exactly the winning club, derived from the
    // scoreline rather than from the feed's own `winner` — which says `OLY` on
    // every game of the season.
    const expected = new Map(
      games.flatMap((game) =>
        game.rows.map((row) => [`${row.personCode}:${game.gameCode}`, row]),
      ),
    );
    for (const row of rows) {
      const source = expected.get(`${row.personCode}:${row.gameCode}`)!;
      expect(row.won).toBe(source.won);
      expect(scoreGame(row.box, row.won).base).toBe(source.valuation);
    }
  });

  it("refuses a game whose box score is empty, and says why", async () => {
    // The trap this guard exists for: an unplayed game answers **200** with
    // `players: []` rather than 404, so "not yet" and "nobody scored" are the
    // same response.
    const game = games[0]!;
    const { doFetch } = feed({
      box: () => ({ local: { players: [] }, road: { players: [] } }),
    });
    const result = await fetchGameBoxScore({
      season: "E2026",
      game: scheduled(game),
      doFetch,
    });
    expect(result.rows).toEqual([]);
    expect(result.problems[0]).toContain("empty box score");
  });

  it("refuses a level scoreline even when the schedule called it played", async () => {
    const game = games[0]!;
    const { doFetch } = feed();
    const result = await fetchGameBoxScore({
      season: "E2026",
      game: { ...scheduled(game), localScore: 0, roadScore: 0 },
      doFetch,
    });
    expect(result.rows).toEqual([]);
    expect(result.problems[0]).toContain("level at 0");
  });

  it("refuses one row whose PIR disagrees and keeps the other 23", async () => {
    const game = games[0]!;
    const { doFetch } = feed({
      box: (entry) => {
        const body = boxBody(entry) as {
          local: { players: { stats: { valuation: number } }[] };
        };
        body.local.players[0]!.stats.valuation = 99;
        return body;
      },
    });
    const result = await fetchGameBoxScore({
      season: "E2025",
      game: scheduled(game),
      doFetch,
    });
    expect(result.rows).toHaveLength(23);
    expect(result.problems[0]).toContain("PIR 99 does not match");
    expect(result.checkedAgainstPir).toBe(23);
  });

  it("refuses a row with no person code, naming the player", async () => {
    const game = games[0]!;
    const { doFetch } = feed({
      box: (entry) => {
        const body = boxBody(entry) as {
          local: { players: { player: { person: { code: string | null } } }[] };
        };
        body.local.players[0]!.player.person.code = null;
        return body;
      },
    });
    const result = await fetchGameBoxScore({
      season: "E2025",
      game: scheduled(game),
      doFetch,
    });
    expect(result.rows).toHaveLength(23);
    expect(result.problems[0]).toMatch(/no person code/);
    expect(result.problems[0]).toContain("Beaubois");
  });

  it("reads a missing stat as nought rather than losing the game", async () => {
    const game = games[0]!;
    const { doFetch } = feed({
      box: (entry) => {
        const body = boxBody(entry) as {
          local: {
            players: { stats: Record<string, number | null | undefined> }[];
          };
        };
        // One absent field, and no `valuation` to check it against.
        delete body.local.players[0]!.stats.plusMinus;
        body.local.players[0]!.stats.valuation = null;
        return body;
      },
    });
    const result = await fetchGameBoxScore({
      season: "E2025",
      game: scheduled(game),
      doFetch,
    });
    expect(result.rows).toHaveLength(24);
    expect(result.rows[0]!.box.plusMinus).toBe(0);
    // Nothing to self-check that row against, so it does not count as checked.
    expect(result.checkedAgainstPir).toBe(23);
  });
});

describe("fetchGameBoxScores", () => {
  it("keeps the games that worked when one game fails outright", async () => {
    const { doFetch } = feed({
      fail: (url) =>
        url.includes("/games/3/stats")
          ? new Response("gone", { status: 404, statusText: "Not Found" })
          : undefined,
    });
    const { fetched, failed } = await fetchGameBoxScores({
      season: "E2025",
      games: games.slice(0, 3).map(scheduled),
      doFetch,
    });

    expect(fetched.map((game) => game.game.gameCode)).toEqual([1, 2]);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toContain("Game 3");
    expect(failed[0]).toContain("404");
  });

  it("retries a rate-limited game and then succeeds", async () => {
    let refusals = 0;
    const { doFetch } = feed({
      fail: (url) => {
        if (!url.includes("/games/1/stats") || refusals >= 1) return undefined;
        refusals += 1;
        return new Response("slow down", {
          status: 429,
          statusText: "Too Many Requests",
          headers: { "retry-after": "0" },
        });
      },
    });
    const { fetched, failed } = await fetchGameBoxScores({
      season: "E2025",
      games: [scheduled(games[0]!)],
      doFetch,
    });
    expect(failed).toEqual([]);
    expect(refusals).toBe(1);
    expect(fetched[0]!.rows).toHaveLength(24);
  });
});
