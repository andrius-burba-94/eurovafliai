import "server-only";

import { getSession } from "@/lib/auth/session";
import { readBasketNewsPlayerRounds } from "@/lib/basketnews/repository";
import type { Position } from "@/lib/engine";
import { completedOnly } from "@/lib/fixtures/progress";
import { readRoundProgress } from "@/lib/fixtures/queries";
import { lineupWeights, resolveLineups } from "@/lib/lineups/lineup";
import { readRecordedLineups } from "@/lib/lineups/store";
import { createUserClient } from "@/lib/pb/server";

import { leagueStats, type LeagueStats } from "./league-stats";
import type { RoundSnapshot } from "./standings";
import { readStandingsSnapshots } from "./queries";

export type StatsPlayer = { readonly name: string; readonly position: Position; readonly clubCode: string; readonly personCode?: string };

export type LeagueStatsPage = {
  readonly stats: LeagueStats;
  readonly players: Readonly<Record<string, StatsPlayer>>;
  /** The finished rounds' snapshots the stats were computed from. */
  readonly snapshots: readonly RoundSnapshot[];
  readonly clubNames: ReadonlyMap<string, string>;
};

/**
 * Everything League Stats needs, read once with the viewer's token so the
 * collections' own rules scope it: the snapshots, the league's membership
 * windows, this season's box scores, the recorded lineups, the draft's picks
 * and the pool's names.
 */
export async function readLeagueStats(leagueId: string, season: string, basketNews = false): Promise<LeagueStatsPage | null> {
  const session = await getSession();
  if (!session) return null;
  const pb = createUserClient(session.token);
  const code = season.replace(/[^A-Za-z0-9]/g, "");

  const [snapshots, windows, lines, drafts, pool, recorded] = await Promise.all([
    readStandingsSnapshots(leagueId, season),
    pb.collection("roster_memberships").getFullList<{
      member: string;
      player: string;
      from_round?: number | null;
      to_round?: number | null;
      to_date?: string | null;
    }>({ filter: `league = '${leagueId}'`, fields: "member,player,from_round,to_round,to_date", requestKey: null }),
    basketNews ? readBasketNewsPlayerRounds(pb, leagueId, code) : pb.collection("player_game_stats").getFullList<{ player: string; round: number; fantasy_pts: number; club_code?: string }>({
      filter: `season = "${code}"`,
      fields: "player,round,fantasy_pts,club_code",
      requestKey: null,
    }),
    pb.collection("drafts").getFullList<{ id: string }>({ filter: `league = '${leagueId}'`, sort: "-created", fields: "id", requestKey: null }),
    pb.collection("players").getFullList<{ id: string; name: string; position: Position; club_code: string; club_name?: string; person_code?: string }>({
      fields: "id,name,position,club_code,club_name,person_code",
      requestKey: null,
    }),
    readRecordedLineups(pb, leagueId, code),
  ]);
  const picks = drafts[0]
    ? await pb.collection("picks").getFullList<{ overall_no: number; round: number; member: string; player: string }>({
        filter: `draft = '${drafts[0].id}'`,
        fields: "overall_no,round,member,player",
        requestKey: null,
      })
    : [];
  const progress = basketNews ? null : await readRoundProgress(season, session.token, snapshots.map((snapshot) => snapshot.round));
  const memberIds = [...new Set(windows.map((row) => row.member))];
  const lineups = resolveLineups({ recorded, rounds: [...new Set(lines.map((line) => line.round))], memberIds });
  const clubOf = new Map(pool.map((player) => [player.id, player.club_code]));
  const finished = progress ? completedOnly(snapshots, progress) : snapshots;

  const stats = leagueStats({
    snapshots: finished,
    lines: lines.map((line) => ({
      playerId: line.player,
      round: line.round,
      fantasyTenths: line.fantasy_pts,
      clubCode: ("club_code" in line && typeof line.club_code === "string" ? line.club_code : undefined) || clubOf.get(line.player),
    })),
    windows: windows.map((row) => ({ memberId: row.member, playerId: row.player, from_round: row.from_round, to_round: row.to_round, to_date: row.to_date })),
    weights: lineupWeights(lineups),
    lineups,
    picks: picks.map((pick) => ({ overallNo: pick.overall_no, round: pick.round, memberId: pick.member, playerId: pick.player })),
    positions: Object.fromEntries(pool.map((player) => [player.id, player.position])),
  });
  return {
    stats,
    snapshots: finished,
    clubNames: new Map(pool.flatMap((player) => (player.club_name ? [[player.club_code, player.club_name] as const] : []))),
    players: Object.fromEntries(
      pool.map((player) => [player.id, { name: player.name, position: player.position, clubCode: player.club_code, personCode: player.person_code }]),
    ),
  };
}
