import { z } from "zod";

import { getFeedJson, type FeedFetch } from "@/lib/euroleague/http";
import { scoreBasketNewsModern, scoreGame, type BoxScore } from "@/lib/stats/scoring";

export type LivePlayer = {
  readonly personCode: string;
  readonly clubCode: string;
  readonly points: number;
  readonly assists: number;
  readonly rebounds: number;
  readonly pir: number;
  /** Provisional score in integer tenths, including the current leader's bonus. */
  readonly fantasyTenths: number;
  /** The same box under BasketNews Modern, for a league that mirrors BasketNews. */
  readonly basketNewsTenths?: number;
  readonly minutes: string;
  readonly playing: boolean;
  /** The rest of the line, for the game page. Snapshots written before it lack these. */
  readonly name?: string;
  readonly dorsal?: string;
  readonly starter?: boolean;
  readonly box?: LiveBoxLine;
};

/** A player's full live line, in the box score's own short names. */
export type LiveBoxLine = {
  readonly fgm2: number;
  readonly fga2: number;
  readonly fgm3: number;
  readonly fga3: number;
  readonly ftm: number;
  readonly fta: number;
  readonly oreb: number;
  readonly dreb: number;
  readonly stl: number;
  readonly tov: number;
  readonly blk: number;
  readonly blka: number;
  readonly pf: number;
  readonly fd: number;
  readonly pm: number;
};

/** Points per period, and where the game clock stands. */
export type LiveDetail = {
  readonly quarters: { readonly local: readonly number[]; readonly road: readonly number[] };
  /** 1–4, then 5+ for each overtime; null until the header has been read. */
  readonly period: number | null;
  /** Time left in the period, `"04:12"`; null until the header has been read. */
  readonly clock: string | null;
  /** The clubs' names as the feed prints them, for a club our rosters have not met. */
  readonly teams?: { readonly local: string; readonly road: string };
};

export type LiveGame = {
  readonly live: boolean;
  readonly localScore: number;
  readonly roadScore: number;
  readonly players: readonly LivePlayer[];
  readonly detail?: LiveDetail;
};

export type LiveParse = {
  readonly game: LiveGame;
  /** Rows whose published PIR disagrees with the components beside it. */
  readonly problems: readonly { readonly personCode: string; readonly message: string }[];
};

const stat = z.number().nullish();
const playerSchema = z.object({
  Player_ID: z.string(),
  Player: z.string().nullish(),
  Dorsal: z.string().nullish(),
  Minutes: z.string().nullish(),
  IsStarter: stat,
  IsPlaying: stat,
  Points: stat,
  FieldGoalsMade2: stat,
  FieldGoalsAttempted2: stat,
  FieldGoalsMade3: stat,
  FieldGoalsAttempted3: stat,
  FreeThrowsMade: stat,
  FreeThrowsAttempted: stat,
  OffensiveRebounds: stat,
  DefensiveRebounds: stat,
  TotalRebounds: stat,
  Assistances: stat,
  Steals: stat,
  Turnovers: stat,
  BlocksFavour: stat,
  BlocksAgainst: stat,
  FoulsCommited: stat,
  FoulsReceived: stat,
  Valuation: stat,
  Plusminus: stat,
});
const liveSchema = z.object({
  Live: z.boolean(),
  ByQuarter: z.array(z.record(z.string(), z.unknown())).nullish(),
  Stats: z.array(z.object({ Team: z.string().nullish(), PlayersStats: z.array(playerSchema).nullish() })).nullish(),
});
type FeedPlayer = z.infer<typeof playerSchema>;

/** A side's points per period in play order: four quarters, then each extra period. */
export function periodsOf(quarter: Record<string, unknown> | undefined): number[] {
  if (!quarter) return [];
  const read = (prefix: string) => Object.entries(quarter)
    .flatMap(([key, value]) => {
      const match = new RegExp(`^${prefix}(\\d+)$`).exec(key);
      return match && typeof value === "number" ? [[Number(match[1]), value] as const] : [];
    })
    .sort((a, b) => a[0] - b[0])
    .map(([, value]) => value);
  return [...read("Quarter"), ...read("Extra")];
}

function scoreOf(quarter: Record<string, unknown> | undefined): number {
  return periodsOf(quarter).reduce((sum, value) => sum + value, 0);
}

/** The live feed pads codes and prefixes them with `P`; rosters store `010781`. */
export function personCodeOf(playerId: string): string {
  return playerId.trim().replace(/^P(?=\d)/, "");
}

/** `"12:20"` is 740 seconds. `"DNP"` and anything else unreadable is zero. */
export function secondsOf(minutes: string | null | undefined): number {
  const match = /^(\d+):(\d{2})$/.exec(minutes?.trim() ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : 0;
}

function boxOf(player: FeedPlayer): BoxScore {
  return {
    timePlayed: secondsOf(player.Minutes),
    points: player.Points ?? 0,
    fieldGoalsMade2: player.FieldGoalsMade2 ?? 0,
    fieldGoalsAttempted2: player.FieldGoalsAttempted2 ?? 0,
    fieldGoalsMade3: player.FieldGoalsMade3 ?? 0,
    fieldGoalsAttempted3: player.FieldGoalsAttempted3 ?? 0,
    freeThrowsMade: player.FreeThrowsMade ?? 0,
    freeThrowsAttempted: player.FreeThrowsAttempted ?? 0,
    offensiveRebounds: player.OffensiveRebounds ?? 0,
    defensiveRebounds: player.DefensiveRebounds ?? 0,
    totalRebounds: player.TotalRebounds ?? 0,
    assistances: player.Assistances ?? 0,
    steals: player.Steals ?? 0,
    turnovers: player.Turnovers ?? 0,
    blocksFavour: player.BlocksFavour ?? 0,
    blocksAgainst: player.BlocksAgainst ?? 0,
    foulsCommited: player.FoulsCommited ?? 0,
    foulsReceived: player.FoulsReceived ?? 0,
    plusMinus: player.Plusminus ?? 0,
  };
}

/**
 * Parse the official live Boxscore and score it with the same `scoreGame` the
 * finished-game ingest uses. The feed's `Valuation` is only a cross-check.
 *
 * `null` means "nothing to publish": no player rows, or a response that says
 * not live while nobody has played a second. The worker treats a published
 * `live: false` snapshot as full time and stops polling that game, so a
 * pregame response must never become one.
 */
export function parseLiveBoxscore(raw: unknown, localClub: string, roadClub: string): LiveParse | null {
  const parsed = liveSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.Stats || parsed.data.Stats.length !== 2) return null;
  const { Live: live, Stats: sides, ByQuarter: quarters } = parsed.data;
  const rows = sides.map((side) => side.PlayersStats ?? []);
  if (!rows.some((side) => side.length > 0)) return null;
  if (!live && !rows.some((side) => side.some((player) => secondsOf(player.Minutes) > 0))) return null;

  const localScore = scoreOf(quarters?.[0]);
  const roadScore = scoreOf(quarters?.[1]);
  const leaders = [localScore > roadScore, roadScore > localScore];
  const problems: { personCode: string; message: string }[] = [];
  const players = rows.flatMap((side, index) => side.flatMap((player): LivePlayer[] => {
    const personCode = personCodeOf(player.Player_ID);
    if (!personCode) return [];
    const clubCode = index === 0 ? localClub : roadClub;
    const box = boxOf(player);
    const { base, fantasyTenths } = scoreGame(box, leaders[index] ?? false);
    if (player.Valuation != null && Math.round(player.Valuation) !== base) {
      problems.push({
        personCode,
        message: `${player.Player?.trim() || personCode} (${clubCode}): the feed's PIR ${player.Valuation} does not match the ${base} its own numbers add up to.`,
      });
    }
    return [{
      personCode,
      clubCode,
      points: box.points,
      assists: box.assistances,
      rebounds: box.totalRebounds,
      pir: base,
      fantasyTenths,
      basketNewsTenths: Math.round(scoreBasketNewsModern(box, leaders[index] ?? false) * 10),
      minutes: player.Minutes?.trim() ?? "",
      playing: live && player.IsPlaying === 1 && player.Minutes?.trim() !== "DNP",
      name: player.Player?.trim() ?? "",
      dorsal: player.Dorsal?.trim() ?? "",
      starter: player.IsStarter === 1,
      box: {
        fgm2: box.fieldGoalsMade2, fga2: box.fieldGoalsAttempted2,
        fgm3: box.fieldGoalsMade3, fga3: box.fieldGoalsAttempted3,
        ftm: box.freeThrowsMade, fta: box.freeThrowsAttempted,
        oreb: box.offensiveRebounds, dreb: box.defensiveRebounds,
        stl: box.steals, tov: box.turnovers,
        blk: box.blocksFavour, blka: box.blocksAgainst,
        pf: box.foulsCommited, fd: box.foulsReceived,
        pm: box.plusMinus,
      },
    }];
  }));
  const detail: LiveDetail = {
    quarters: { local: periodsOf(quarters?.[0]), road: periodsOf(quarters?.[1]) },
    period: null,
    clock: null,
    teams: { local: sides[0]?.Team?.trim() ?? "", road: sides[1]?.Team?.trim() ?? "" },
  };
  return { game: { live, localScore, roadScore, players, detail }, problems };
}

const headerSchema = z.object({
  Quarter: z.union([z.string(), z.number()]).nullish(),
  RemainingPartialTime: z.string().nullish(),
});

export type LiveHeader = { readonly period: number | null; readonly clock: string | null };

/**
 * The header's period and clock; null when it names neither. Between periods
 * the feed blanks the quarter and stops the clock at `00:00`, so a clock with
 * no period is a break — `withHeader` works out which one.
 */
export function parseLiveHeader(raw: unknown): LiveHeader | null {
  const parsed = headerSchema.safeParse(raw);
  if (!parsed.success) return null;
  const quarter = Number(String(parsed.data.Quarter ?? "").trim() || NaN);
  const period = Number.isInteger(quarter) && quarter >= 1 ? quarter : null;
  const clock = /^\d{1,2}:\d{2}$/.exec(parsed.data.RemainingPartialTime?.trim() ?? "")?.[0] ?? null;
  if (period === null && clock === null) return null;
  return { period, clock };
}

/**
 * The detail with the header's clock on it. A break names no period, so it is
 * the last period anyone has scored in, with the clock run out.
 */
export function withHeader(detail: LiveDetail, header: LiveHeader | null): LiveDetail {
  if (!header) return detail;
  if (header.period !== null) return { ...detail, period: header.period, clock: header.clock };
  const scored = Math.max(0, ...[detail.quarters.local, detail.quarters.road].map((side) => side.findLastIndex((points) => points > 0) + 1));
  return scored > 0 ? { ...detail, period: scored, clock: "00:00" } : detail;
}

/**
 * The feed's CDN keeps each answer for 60 seconds; a query it has not seen
 * goes to the origin. Measured on game 122 of E2026: the cached Boxscore was
 * 11 seconds and two points behind the origin's.
 */
function liveUrl(resource: "Boxscore" | "Header", gameCode: number, season: string, now: number): string {
  return `https://live.euroleague.net/api/${resource}?gamecode=${gameCode}&seasoncode=${encodeURIComponent(season)}&_=${now}`;
}

export async function fetchLiveBoxscore(gameCode: number, season: string, localClub: string, roadClub: string, doFetch: FeedFetch = fetch, now = Date.now()): Promise<LiveParse | null> {
  return parseLiveBoxscore(await getFeedJson(liveUrl("Boxscore", gameCode, season, now), doFetch), localClub, roadClub);
}

export async function fetchLiveHeader(gameCode: number, season: string, doFetch: FeedFetch = fetch, now = Date.now()): Promise<LiveHeader | null> {
  return parseLiveHeader(await getFeedJson(liveUrl("Header", gameCode, season, now), doFetch));
}
