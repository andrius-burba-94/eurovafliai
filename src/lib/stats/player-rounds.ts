/**
 * Every player's fantasy points per round, in the league's own ruleset.
 *
 * The one place the two rulesets differ when a reader needs "what did this
 * player score": a EuroLeague league reads `fantasy_pts`; a BasketNews league
 * reads the feed's BasketNews Modern value (`basketnews_raw_pts`, hundredths)
 * and lets BasketNews's own published value win wherever a lineup recorded one.
 *
 * The feed half is what makes a free agent score. `round_lineups` only carries
 * players someone rostered, so reading it alone gave a released player zero
 * and every free-agent swap looked won.
 */

import type PocketBase from "pocketbase";

import { readBasketNewsPlayerRounds } from "@/lib/basketnews/repository";

export type PlayerRoundLine = {
  readonly player: string;
  readonly round: number;
  /** Fantasy points in tenths, possibly fractional before a round is rounded. */
  readonly fantasy_pts: number;
  readonly pir: number;
  readonly club_code?: string;
};

type FeedRow = {
  player: string;
  round: number;
  fantasy_pts: number;
  basketnews_raw_pts?: number;
  pir: number;
  club_code?: string;
};

/**
 * One line per (player, round): the feed's games summed, then the official
 * BasketNews value laid over it. Recompute anchors the official value to a
 * player's first game of the round and zeroes the rest, so replacing the
 * round's sum is exact for a rostered player.
 */
export function mergeBasketNewsLines(
  official: readonly { player: string; round: number; fantasy_pts: number }[],
  feed: readonly { player: string; round: number; rawHundredths: number; pir: number; club_code?: string }[],
): PlayerRoundLine[] {
  const merged = new Map<string, { player: string; round: number; fantasy_pts: number; pir: number; club_code?: string }>();
  for (const row of feed) {
    const key = `${row.player}|${row.round}`;
    const slot = merged.get(key) ?? { player: row.player, round: row.round, fantasy_pts: 0, pir: 0, club_code: row.club_code };
    slot.fantasy_pts += row.rawHundredths / 10;
    slot.pir += row.pir;
    merged.set(key, slot);
  }
  for (const row of official) {
    const key = `${row.player}|${row.round}`;
    const slot = merged.get(key) ?? { player: row.player, round: row.round, fantasy_pts: 0, pir: 0 };
    slot.fantasy_pts = row.fantasy_pts;
    merged.set(key, slot);
  }
  return [...merged.values()];
}

export async function readLeaguePlayerRounds(
  pb: PocketBase,
  {
    leagueId,
    season,
    basketNews,
    players,
    round,
  }: {
    leagueId: string;
    season: string;
    basketNews: boolean;
    /** Only these players; omitted means everyone with a line. */
    players?: readonly string[];
    round?: number;
  },
): Promise<PlayerRoundLine[]> {
  if (players && players.length === 0) return [];
  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const filter = [
    `season = "${code}"`,
    ...(round === undefined ? [] : [`round = ${round}`]),
    ...(players ? [`(${players.map((id) => `player = '${id}'`).join(" || ")})`] : []),
  ].join(" && ");
  const feed = await pb.collection("player_game_stats").getFullList<FeedRow>({
    filter,
    fields: basketNews ? "player,round,basketnews_raw_pts,pir,club_code" : "player,round,fantasy_pts,pir,club_code",
    requestKey: null,
  });
  if (!basketNews) return feed.map((row) => ({ player: row.player, round: row.round, fantasy_pts: row.fantasy_pts, pir: row.pir, club_code: row.club_code }));

  const wanted = players ? new Set(players) : null;
  const official = (await readBasketNewsPlayerRounds(pb, leagueId, code)).filter(
    (row) => (round === undefined || row.round === round) && (!wanted || wanted.has(row.player)),
  );
  return mergeBasketNewsLines(
    official,
    feed.map((row) => ({ player: row.player, round: row.round, rawHundredths: row.basketnews_raw_pts ?? 0, pir: row.pir, club_code: row.club_code })),
  );
}
