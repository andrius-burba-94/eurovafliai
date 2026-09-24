import type { Position } from "@/lib/engine";
import {
  averageFantasyOf,
  averagePirOf,
  last5SeriesOf,
} from "@/lib/stats/project";

import type { PoolPlayer } from "./search";

/**
 * A `players` record as the pool reads it — the draft room's and, since 11.2,
 * the side panel's. One field list and one mapping, so the two surfaces show
 * the same average for the same player.
 */
export type PoolPlayerRecord = {
  id: string;
  name: string;
  name_normalized: string;
  club_code: string;
  club_name: string;
  position: Position;
  status: string;
  proj_last5_fantasy?: number;
  proj_last5_games?: number;
  proj_last5_pir?: number;
  proj_last5_pirs?: unknown;
  prev_season_games?: number;
  prev_season_pir?: number;
  prev_season_fantasy?: number;
  prev_season_code?: string;
};

export function toPoolPlayer(
  player: PoolPlayerRecord,
  held: { by: string; at: number | null } | null | undefined,
): PoolPlayer {
  const average = averagePirOf(player);
  return {
    id: player.id,
    name: player.name,
    // The ingestion match key, carried so the browser can match
    // "valanciunas" against "Valančiūnas" without owning a second folding
    // implementation. Never displayed — ingestion sorts its tokens.
    normalized: player.name_normalized ?? "",
    club: player.club_code,
    // The club's full name, for the filter's own list. A dropdown of bare
    // codes asks the reader to know that OLY is Olympiacos.
    clubName: player.club_name ?? player.club_code,
    position: player.position,
    status: player.status,
    takenBy: held?.by ?? null,
    takenAt: held?.at ?? null,
    averagePir: average?.tenths ?? null,
    averageGames: average?.games ?? 0,
    averageSource: average?.source ?? null,
    // Only when the average is this season's form. A `prev` average has no
    // per-game lines behind it — it is imported already averaged — so a
    // series there would be five marks we invented.
    last5Pirs: average?.source === "last5" ? last5SeriesOf(player) : [],
    averageSeason: average?.season ?? null,
    averageFantasy: averageFantasyOf(player) ?? null,
  };
}
