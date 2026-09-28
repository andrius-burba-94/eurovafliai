import { z } from "zod";

import { getFeedJson, type FeedFetch } from "@/lib/euroleague/http";

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

const playerSchema = z.object({
  Player_ID: z.string(),
  Team: z.string(),
  Minutes: z.string().nullish(),
  Points: z.number().nullish(),
  Assistances: z.number().nullish(),
  TotalRebounds: z.number().nullish(),
  Valuation: z.number().nullish(),
  IsPlaying: z.number().nullish(),
});
const liveSchema = z.object({
  Live: z.boolean(),
  ByQuarter: z.array(z.record(z.string(), z.unknown())).nullish(),
  Stats: z.array(z.object({ PlayersStats: z.array(playerSchema).nullish() })).nullish(),
});

function scoreOf(quarter: Record<string, unknown> | undefined): number {
  if (!quarter) return 0;
  return Object.entries(quarter).reduce((sum, [key, value]) =>
    /^(Quarter|Extra)\d+$/.test(key) && typeof value === "number" ? sum + value : sum, 0);
}

/** Parse only fields observed in the official live Boxscore response. */
export function parseLiveBoxscore(raw: unknown, localClub: string, roadClub: string): LiveGame | null {
  const parsed = liveSchema.safeParse(raw);
  if (!parsed.success || !parsed.data.Stats || parsed.data.Stats.length !== 2) return null;
  const sides = parsed.data.Stats;
  if (!sides.some((side) => (side.PlayersStats?.length ?? 0) > 0)) return null;
  const localScore = scoreOf(parsed.data.ByQuarter?.[0]);
  const roadScore = scoreOf(parsed.data.ByQuarter?.[1]);
  const leaders = [localScore > roadScore, roadScore > localScore];
  const players = sides.flatMap((side, index) => (side.PlayersStats ?? []).flatMap((player): LivePlayer[] => {
    const personCode = player.Player_ID.trim();
    if (!personCode || player.Valuation == null) return [];
    const clubCode = index === 0 ? localClub : roadClub;
    const pir = Math.round(player.Valuation);
    return [{
      personCode,
      clubCode,
      points: player.Points ?? 0,
      assists: player.Assistances ?? 0,
      rebounds: player.TotalRebounds ?? 0,
      pir,
      fantasyTenths: pir * (leaders[index] ? 11 : 10),
      minutes: player.Minutes ?? "",
      playing: parsed.data.Live && player.IsPlaying === 1,
    }];
  }));
  return { live: parsed.data.Live, localScore, roadScore, players };
}

export async function fetchLiveBoxscore(gameCode: number, season: string, localClub: string, roadClub: string, doFetch: FeedFetch = fetch): Promise<LiveGame | null> {
  const url = `https://live.euroleague.net/api/Boxscore?gamecode=${gameCode}&seasoncode=${encodeURIComponent(season)}`;
  return parseLiveBoxscore(await getFeedJson(url, doFetch), localClub, roadClub);
}
