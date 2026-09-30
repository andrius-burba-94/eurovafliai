import { z } from "zod";

import { getFeedJson, type FeedFetch } from "@/lib/euroleague/http";
import { scoreGame, type BoxScore } from "@/lib/stats/scoring";

export type LivePlayer = {
  readonly personCode: string;
  readonly clubCode: string;
  readonly points: number;
  readonly assists: number;
  readonly rebounds: number;
  readonly pir: number;
  /** Provisional score in integer tenths, including the current leader's bonus. */
  readonly fantasyTenths: number;
  readonly minutes: string;
  readonly playing: boolean;
};

export type LiveGame = {
  readonly live: boolean;
  readonly localScore: number;
  readonly roadScore: number;
  readonly players: readonly LivePlayer[];
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
  Minutes: z.string().nullish(),
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
  Stats: z.array(z.object({ PlayersStats: z.array(playerSchema).nullish() })).nullish(),
});
type FeedPlayer = z.infer<typeof playerSchema>;

function scoreOf(quarter: Record<string, unknown> | undefined): number {
  if (!quarter) return 0;
  return Object.entries(quarter).reduce((sum, [key, value]) =>
    /^(Quarter|Extra)\d+$/.test(key) && typeof value === "number" ? sum + value : sum, 0);
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
      minutes: player.Minutes?.trim() ?? "",
      playing: live && player.IsPlaying === 1 && player.Minutes?.trim() !== "DNP",
    }];
  }));
  return { game: { live, localScore, roadScore, players }, problems };
}

export async function fetchLiveBoxscore(gameCode: number, season: string, localClub: string, roadClub: string, doFetch: FeedFetch = fetch): Promise<LiveParse | null> {
  const url = `https://live.euroleague.net/api/Boxscore?gamecode=${gameCode}&seasoncode=${encodeURIComponent(season)}`;
  return parseLiveBoxscore(await getFeedJson(url, doFetch), localClub, roadClub);
}
