import "server-only";

import { readStoredFixtures, type FixtureRecord } from "@/lib/fixtures/store";
import { readLineupWeights } from "@/lib/lineups/store";
import { createUserClient } from "@/lib/pb/server";
import { readStandingsSnapshots } from "@/lib/stats/queries";
import { snapshotRowsFrom } from "@/lib/stats/standings";

import { personCodeOf, type LivePlayer } from "./boxscore";
import { provisionalRanks, type ProvisionalRank, type ScoredGameLine } from "./rank";
import { readLiveSnapshots, type LiveSnapshot } from "./store";

export type MatchdayData = {
  readonly season: string;
  readonly fetchedAt: string;
  readonly round: number;
  readonly fixtures: readonly FixtureRecord[];
  readonly snapshots: readonly LiveSnapshot[];
  readonly ranks: readonly ProvisionalRank[];
  readonly scoresByPlayer: Readonly<Record<string, number>>;
  /** The live box-score line, until the official one is recorded for that game. */
  readonly statsByPlayer: Readonly<Record<string, LivePlayer>>;
  readonly final: boolean;
  readonly hasScoringBasis: boolean;
};

function chooseRound(fixtures: readonly FixtureRecord[], requested: number | null): number {
  const rounds = [...new Set(fixtures.map((game) => game.round))].sort((a, b) => a - b);
  if (requested !== null && rounds.includes(requested)) return requested;
  return fixtures.filter((game) => !game.played).sort((a, b) => a.round - b.round)[0]?.round ?? rounds.at(-1) ?? 1;
}

export async function readMatchdayData(input: {
  leagueId: string;
  memberIds: readonly string[];
  season: string;
  requestedRound: number | null;
  token: string;
}): Promise<MatchdayData> {
  const pb = createUserClient(input.token);
  const allFixtures = await readStoredFixtures(pb, input.season);
  const round = chooseRound(allFixtures, input.requestedRound);
  const fixtures = allFixtures.filter((game) => game.round === round).sort((a, b) => (a.utc_date ?? "").localeCompare(b.utc_date ?? ""));
  const [snapshots, memberships, finalRows, players, standings, weights] = await Promise.all([
    readLiveSnapshots(pb, input.season, round),
    pb.collection("roster_memberships").getFullList<{ member: string; player: string; from_round?: number | null; to_round?: number | null; to_date?: string | null }>({
      filter: `league = '${input.leagueId}'`,
      fields: "member,player,from_round,to_round,to_date",
      requestKey: null,
    }),
    pb.collection("player_game_stats").getFullList<{ player: string; game_code: number; fantasy_pts: number }>({
      filter: `season = '${input.season}' && round = ${round}`,
      fields: "player,game_code,fantasy_pts",
      requestKey: null,
    }),
    pb.collection("players").getFullList<{ id: string; person_code: string }>({ fields: "id,person_code", requestKey: null }),
    readStandingsSnapshots(input.leagueId, input.season),
    readLineupWeights(pb, input.leagueId, input.season, [round], input.memberIds),
  ]);
  const byPerson = new Map(players.map((player) => [player.person_code?.trim(), player.id]));
  const finalLines: ScoredGameLine[] = finalRows.map((row) => ({ playerId: row.player, gameCode: row.game_code, fantasyTenths: row.fantasy_pts }));
  const finalKeys = new Set(finalLines.map((line) => `${line.playerId}|${line.gameCode}`));
  const statsByPlayer: Record<string, LivePlayer> = {};
  const liveLines: ScoredGameLine[] = snapshots.flatMap((game) => game.players.flatMap((player) => {
    const playerId = byPerson.get(personCodeOf(player.personCode));
    if (!playerId) return [];
    if (!finalKeys.has(`${playerId}|${game.game_code}`)) statsByPlayer[playerId] = player;
    return [{ playerId, gameCode: game.game_code, fantasyTenths: player.fantasyTenths }];
  }));
  const scoresByPlayer: Record<string, number> = {};
  for (const line of [...finalLines, ...liveLines.filter((line) => !finalKeys.has(`${line.playerId}|${line.gameCode}`))]) {
    scoresByPlayer[line.playerId] = (scoresByPlayer[line.playerId] ?? 0) + line.fantasyTenths;
  }
  const previous = standings.filter((snapshot) => snapshot.round < round).at(-1);
  const baseTotals = Object.fromEntries((previous?.table ?? []).map((row) => [row.memberId, row.totalHundredths]));
  const finalSnapshot = standings.find((snapshot) => snapshot.round === round);
  const final = fixtures.length > 0 && fixtures.every((game) => game.played) && Boolean(finalSnapshot);
  const hasScoringBasis = Boolean(previous || final || finalLines.length || liveLines.length);
  const ranks = final
    ? snapshotRowsFrom(finalSnapshot!.table).sort((a, b) => b.totalHundredths - a.totalHundredths || a.memberId.localeCompare(b.memberId)).map((row, index) => ({ ...row, rank: index + 1 }))
    : provisionalRanks({ memberIds: input.memberIds, baseTotals, memberships, finalLines, liveLines, round, weights });
  return { season: input.season, fetchedAt: new Date().toISOString(), round, fixtures, snapshots, ranks, scoresByPlayer, statsByPlayer, final, hasScoringBasis };
}
