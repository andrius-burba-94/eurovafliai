import "server-only";

import { getSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { readLineupWeights } from "@/lib/lineups/store";
import { createUserClient } from "@/lib/pb/server";

import { leagueStats, type LeagueStats } from "./league-stats";
import { readStandingsSnapshots } from "./queries";

export type StatsPlayer = { readonly name: string; readonly position: Position; readonly clubCode: string; readonly personCode?: string };

export type LeagueStatsPage = {
  readonly stats: LeagueStats;
  readonly players: Readonly<Record<string, StatsPlayer>>;
};

/**
 * Everything League Stats needs, read once with the viewer's token so the
 * collections' own rules scope it: the snapshots, the league's membership
 * windows, this season's box scores, the recorded lineups, the draft's picks
 * and the pool's names.
 */
export async function readLeagueStats(leagueId: string, season: string): Promise<LeagueStatsPage | null> {
  const session = await getSession();
  if (!session) return null;
  const pb = createUserClient(session.token);
  const code = season.replace(/[^A-Za-z0-9]/g, "");

  const [snapshots, windows, lines, drafts, pool] = await Promise.all([
    readStandingsSnapshots(leagueId, season),
    pb.collection("roster_memberships").getFullList<{
      member: string;
      player: string;
      from_round?: number | null;
      to_round?: number | null;
      to_date?: string | null;
    }>({ filter: `league = '${leagueId}'`, fields: "member,player,from_round,to_round,to_date", requestKey: null }),
    pb.collection("player_game_stats").getFullList<{ player: string; round: number; fantasy_pts: number }>({
      filter: `season = "${code}"`,
      fields: "player,round,fantasy_pts",
      requestKey: null,
    }),
    pb.collection("drafts").getFullList<{ id: string }>({ filter: `league = '${leagueId}'`, sort: "-created", fields: "id", requestKey: null }),
    pb.collection("players").getFullList<{ id: string; name: string; position: Position; club_code: string; person_code?: string }>({
      fields: "id,name,position,club_code,person_code",
      requestKey: null,
    }),
  ]);
  const picks = drafts[0]
    ? await pb.collection("picks").getFullList<{ overall_no: number; round: number; member: string; player: string; is_auto?: boolean }>({
        filter: `draft = '${drafts[0].id}'`,
        fields: "overall_no,round,member,player,is_auto",
        requestKey: null,
      })
    : [];
  const memberIds = [...new Set(windows.map((row) => row.member))];
  const weights = await readLineupWeights(pb, leagueId, code, [...new Set(lines.map((line) => line.round))], memberIds);

  const stats = leagueStats({
    snapshots,
    lines: lines.map((line) => ({ playerId: line.player, round: line.round, fantasyTenths: line.fantasy_pts })),
    windows: windows.map((row) => ({ memberId: row.member, playerId: row.player, from_round: row.from_round, to_round: row.to_round, to_date: row.to_date })),
    weights,
    picks: picks.map((pick) => ({ overallNo: pick.overall_no, round: pick.round, memberId: pick.member, playerId: pick.player, isAuto: Boolean(pick.is_auto) })),
    positions: Object.fromEntries(pool.map((player) => [player.id, player.position])),
  });
  return {
    stats,
    players: Object.fromEntries(
      pool.map((player) => [player.id, { name: player.name, position: player.position, clubCode: player.club_code, personCode: player.person_code }]),
    ),
  };
}
