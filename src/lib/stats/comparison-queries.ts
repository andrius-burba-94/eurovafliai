import "server-only";

import { difficultyOf } from "@/lib/fixtures/schedule";
import { readStoredFixtures, scheduleRowsFrom } from "@/lib/fixtures/store";
import type { LineupPlayer } from "@/lib/lineups/queries";
import { createUserClient } from "@/lib/pb/server";

export type ComparisonPlayer = {
  readonly id: string;
  readonly name: string;
  readonly position: string;
  readonly clubCode: string;
  readonly estimateTenths: number | null;
  readonly estimateSource: string | null;
  readonly pirEstimateTenths: number | null;
  readonly lastGames: readonly { round: number; fantasyTenths: number; pir: number }[];
  readonly nextFive: readonly { round: number; opponent: string; difficulty: "easy" | "even" | "hard" | null }[];
};

/** One stats read and one fixture read for the whole lineup comparison drawer. */
export async function readComparisonPlayers(players: readonly LineupPlayer[], season: string, token: string): Promise<ComparisonPlayer[]> {
  if (players.length === 0) return [];
  const pb = createUserClient(token);
  const [games, storedFixtures] = await Promise.all([
    pb.collection("player_game_stats").getFullList<{ player: string; round: number; game_code: number; fantasy_pts: number; pir: number }>({
      filter: `season = '${season}' && (${players.map((player) => `player = '${player.id}'`).join(" || ")})`,
      fields: "player,round,game_code,fantasy_pts,pir",
      requestKey: null,
    }),
    readStoredFixtures(pb, season),
  ]);
  const fixtures = scheduleRowsFrom(storedFixtures);
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    position: player.position,
    clubCode: player.clubCode,
    estimateTenths: player.estimateTenths,
    estimateSource: player.estimateSource,
    pirEstimateTenths: player.pirEstimateTenths,
    lastGames: games.filter((game) => game.player === player.id).sort((a, b) => a.round - b.round || a.game_code - b.game_code).slice(-5).map((game) => ({ round: game.round, fantasyTenths: game.fantasy_pts, pir: game.pir })),
    nextFive: fixtures.filter((game) => !game.played && (game.localClub === player.clubCode || game.roadClub === player.clubCode))
      .sort((a, b) => (a.utcDate ?? "").localeCompare(b.utcDate ?? "") || a.round - b.round)
      .slice(0, 5)
      .map((game) => ({
        round: game.round,
        opponent: game.localClub === player.clubCode ? game.roadClub : game.localClub,
        difficulty: difficultyOf({ rows: fixtures, club: player.clubCode, game }),
      })),
  }));
}
