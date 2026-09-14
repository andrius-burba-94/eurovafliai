/**
 * One season's accumulated player totals, from the official stats table.
 *
 * Pure: the URL is built here and the rows are normalized here, so the four
 * ways this endpoint lies can be tested without a network. `euroleague.ts`
 * does the fetching.
 *
 * ## Why this endpoint at all
 *
 * A draft happens before the season starts, so every number on draft night is
 * last season's. We already hold last season's box scores, but the league
 * reads the official site, and a number that disagrees with the site by a
 * tenth is a number nobody trusts. So the feed is the source and our own
 * backfill is the cross-check (`npm run stats:prev -- --check`).
 *
 * ## The four traps, all measured against the live feed
 *
 * 1. **`seasonMode=Single` is mandatory.** Without it `seasonCode` is ignored
 *    entirely and the endpoint answers **all-time career leaders** — E2025 and
 *    E2026 both return the same 642 rows, including retired players, with
 *    `gamesPlayed` up to 487 and `team.code` reading `PAO;PES;ULK;MIL`. There
 *    is no error and nothing looks wrong. `SEASON_TOTALS_PARAMS` exists so a
 *    test can assert the parameter is still on the URL.
 * 2. **`statisticMode=accumulated`, never `perGame`.** `perGame` applies a
 *    minimum-games qualification — 208 rows for E2025, minimum 24 games — and
 *    silently drops 127 of 335 players: exactly the fringe, injured and
 *    mid-season arrivals a draft has to price. Cory Joseph (16 games) and
 *    Moustapha Fall (2 games) are absent from it. We take totals and divide.
 * 3. **`team.code` can be `;`-joined** for a player who moved mid-season
 *    (9 such rows in E2025), so it is never matched against a club code.
 * 4. **The current season answers `total: 0`** until its first game is played,
 *    which is not an error and must not be treated as one.
 *
 * It is also the only resource on this API served by **v3**; v1, v2 and v4 all
 * answer `UnsupportedApiVersion` on the same path. The rest of the app is v2.
 * See docs/research/euroleague-api.md.
 */
import { z } from "zod";

/** v3, and only v3. The rest of the feed is v2 — see the module header. */
export const STATS_BASE = "https://api-live.euroleague.net/v3/competitions/E";

/**
 * The parameters that decide *which* numbers come back, in one place.
 *
 * Not inlined into the URL builder, because two of them are the difference
 * between this season's players and every player who ever played, and a
 * silent regression there is worth a test of its own.
 */
export const SEASON_TOTALS_PARAMS = {
  seasonMode: "Single",
  statisticMode: "accumulated",
  limit: "1000",
} as const;

export function seasonTotalsUrl(season: string): string {
  const params = new URLSearchParams({
    seasonCode: season,
    ...SEASON_TOTALS_PARAMS,
  });
  return `${STATS_BASE}/statistics/players/traditional?${params.toString()}`;
}

/**
 * The feed's third vocabulary for the same nineteen counted things.
 *
 * `BoxScore` calls this `assistances`, the database column is `assists`, and
 * here it is `assists` again but blocks are `blocks` rather than
 * `blocksFavour`. Tolerant on purpose, the same argument 4.3 made for
 * declining the SDK: a field we never read changing shape must not refuse a
 * whole season.
 */
const totalsRowSchema = z.object({
  player: z.object({
    code: z.string().nullish(),
    name: z.string().nullish(),
    age: z.number().nullish(),
    imageUrl: z.string().nullish(),
    team: z
      .object({ code: z.string().nullish(), name: z.string().nullish() })
      .nullish(),
  }),
  gamesPlayed: z.number().nullish(),
  gamesStarted: z.number().nullish(),
  minutesPlayed: z.number().nullish(),
  pointsScored: z.number().nullish(),
  totalRebounds: z.number().nullish(),
  offensiveRebounds: z.number().nullish(),
  defensiveRebounds: z.number().nullish(),
  assists: z.number().nullish(),
  steals: z.number().nullish(),
  turnovers: z.number().nullish(),
  blocks: z.number().nullish(),
  blocksAgainst: z.number().nullish(),
  foulsCommited: z.number().nullish(),
  foulsDrawn: z.number().nullish(),
  twoPointersPercentage: z.string().nullish(),
  threePointersPercentage: z.string().nullish(),
  freeThrowsPercentage: z.string().nullish(),
  pir: z.number().nullish(),
});

export const seasonTotalsResponseSchema = z.object({
  total: z.number().nullish(),
  players: z.array(totalsRowSchema).nullish(),
});

/** Per-game averages for one player, as integer tenths. */
export type SeasonAverages = {
  readonly personCode: string;
  readonly name: string;
  readonly games: number;
  /** Integer tenths. */
  readonly pir: number;
  readonly points: number;
  readonly rebounds: number;
  readonly assists: number;
  readonly minutes: number;
  /** The feed's own strings, e.g. `"34.4%"`. Shown, never computed with. */
  readonly twoPointPct: string;
  readonly threePointPct: string;
  readonly freeThrowPct: string;
};

/**
 * A season total divided into a per-game average, in tenths.
 *
 * Zero games is zero rather than a division by zero, and callers key absence
 * off the games count — the rule the rest of this module already follows.
 */
export function perGameTenths(total: number, games: number): number {
  if (games <= 0) return 0;
  const scaled = (total * 10) / games;
  return scaled < 0 ? -Math.round(-scaled) : Math.round(scaled);
}

/**
 * The rows we can use, keyed by person code.
 *
 * A row with no person code is dropped rather than name-matched: box scores
 * and the pool both join on the code, and guessing here would put a season's
 * work on the wrong player. A row with no games played is dropped too — it
 * carries no average and would otherwise write a 0 that reads as real.
 */
export function seasonAveragesFrom(body: unknown): SeasonAverages[] {
  const parsed = seasonTotalsResponseSchema.parse(body);
  const rows = parsed.players ?? [];

  const averages: SeasonAverages[] = [];
  for (const row of rows) {
    const personCode = (row.player.code ?? "").trim();
    const games = row.gamesPlayed ?? 0;
    if (personCode === "" || games <= 0) continue;

    averages.push({
      personCode,
      name: (row.player.name ?? "").trim(),
      games,
      pir: perGameTenths(row.pir ?? 0, games),
      points: perGameTenths(row.pointsScored ?? 0, games),
      rebounds: perGameTenths(row.totalRebounds ?? 0, games),
      assists: perGameTenths(row.assists ?? 0, games),
      minutes: perGameTenths(row.minutesPlayed ?? 0, games),
      twoPointPct: row.twoPointersPercentage ?? "",
      threePointPct: row.threePointersPercentage ?? "",
      freeThrowPct: row.freeThrowsPercentage ?? "",
    });
  }
  return averages;
}

/** What the player page shows under "last season". One json column. */
export type StoredSeasonStats = {
  readonly points: number;
  readonly rebounds: number;
  readonly assists: number;
  readonly minutes: number;
  readonly twoPointPct: string;
  readonly threePointPct: string;
  readonly freeThrowPct: string;
};

export function storedStatsOf(average: SeasonAverages): StoredSeasonStats {
  return {
    points: average.points,
    rebounds: average.rebounds,
    assists: average.assists,
    minutes: average.minutes,
    twoPointPct: average.twoPointPct,
    threePointPct: average.threePointPct,
    freeThrowPct: average.freeThrowPct,
  };
}
