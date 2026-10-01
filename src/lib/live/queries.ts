import "server-only";

import type PocketBase from "pocketbase";

import { readStoredFixtures, type FixtureRecord } from "@/lib/fixtures/store";
import { readLineupWeights } from "@/lib/lineups/store";
import { createUserClient } from "@/lib/pb/server";
import { readStandingsSnapshots } from "@/lib/stats/queries";
import { snapshotRowsFrom } from "@/lib/stats/standings";

import { personCodeOf, type LivePlayer } from "./boxscore";
import { provisionalRanks, type ProvisionalRank, type ScoredGameLine } from "./rank";
import { playerRoundOf, type PlayerRound } from "./status";
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

type RoundScores = {
  readonly snapshots: readonly LiveSnapshot[];
  readonly finalLines: readonly ScoredGameLine[];
  readonly liveLines: readonly ScoredGameLine[];
  readonly scoresByPlayer: Readonly<Record<string, number>>;
  readonly statsByPlayer: Readonly<Record<string, LivePlayer>>;
};

function chooseRound(fixtures: readonly FixtureRecord[], requested: number | null): number {
  const rounds = [...new Set(fixtures.map((game) => game.round))].sort((a, b) => a - b);
  if (requested !== null && rounds.includes(requested)) return requested;
  return fixtures.filter((game) => !game.played).sort((a, b) => a.round - b.round)[0]?.round ?? rounds.at(-1) ?? 1;
}

/** A recorded box score replaces the live line for the same player and game. */
async function readRoundScores(pb: Pick<PocketBase, "collection">, season: string, round: number): Promise<RoundScores> {
  const [snapshots, finalRows, players] = await Promise.all([
    readLiveSnapshots(pb, season, round),
    pb.collection("player_game_stats").getFullList<{ player: string; game_code: number; fantasy_pts: number }>({
      filter: `season = '${season}' && round = ${round}`,
      fields: "player,game_code,fantasy_pts",
      requestKey: null,
    }),
    pb.collection("players").getFullList<{ id: string; person_code: string }>({ fields: "id,person_code", requestKey: null }),
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
  return { snapshots, finalLines, liveLines, scoresByPlayer, statsByPlayer };
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
  const [scores, memberships, standings, weights] = await Promise.all([
    readRoundScores(pb, input.season, round),
    pb.collection("roster_memberships").getFullList<{ member: string; player: string; from_round?: number | null; to_round?: number | null; to_date?: string | null }>({
      filter: `league = '${input.leagueId}'`,
      fields: "member,player,from_round,to_round,to_date",
      requestKey: null,
    }),
    readStandingsSnapshots(input.leagueId, input.season),
    readLineupWeights(pb, input.leagueId, input.season, [round], input.memberIds),
  ]);
  const { snapshots, finalLines, liveLines, scoresByPlayer, statsByPlayer } = scores;
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

export type LineupLive = {
  readonly byPlayer: Readonly<Record<string, PlayerRound>>;
  /** A game of the round has tipped off, finished or been recorded. */
  readonly underway: boolean;
  /** Every game of the round has a recorded result. */
  readonly final: boolean;
  /** Tip-off is within five minutes or a game is still inside its window. */
  readonly hasGameWindow: boolean;
  readonly hasPlayedGames: boolean;
  /** A game's live feed has stopped and its official box score is not in yet. */
  readonly hasFullTime: boolean;
  readonly checkedAt: readonly string[];
  readonly gameTimes: readonly string[];
};

/** The Live page's per-player numbers for one round, for the lineup court. */
export async function readLineupLive(input: {
  season: string;
  round: number;
  players: readonly { id: string; clubCode: string }[];
  token: string;
}): Promise<LineupLive> {
  const pb = createUserClient(input.token);
  const [allFixtures, scores] = await Promise.all([
    readStoredFixtures(pb, input.season),
    readRoundScores(pb, input.season, input.round),
  ]);
  const fixtures = allFixtures.filter((game) => game.round === input.round);
  const now = Date.now();
  const snapshots = new Map(scores.snapshots.map((row) => [row.game_code, row]));
  const byPlayer = Object.fromEntries(input.players.map((player) => {
    const { tenths, state, tipOff } = playerRoundOf({ clubCode: player.clubCode, fixtures, snapshots, tenths: scores.scoresByPlayer[player.id] ?? null, now });
    return [player.id, { tenths, state, tipOff }];
  }));
  const gameTimes = fixtures.map((game) => game.utc_date ?? "");
  return {
    byPlayer,
    underway: fixtures.some((game) => game.played || snapshots.has(game.game_code)),
    final: fixtures.length > 0 && fixtures.every((game) => game.played),
    hasGameWindow: gameTimes.some((stamp) => {
      const tip = Date.parse(stamp);
      return Number.isFinite(tip) && now >= tip - 5 * 60_000 && now < tip + 4 * 60 * 60_000;
    }),
    hasPlayedGames: fixtures.some((game) => game.played),
    hasFullTime: fixtures.some((game) => !game.played && snapshots.get(game.game_code)?.live === false),
    checkedAt: scores.snapshots.filter((row) => row.live).map((row) => row.checked_at),
    gameTimes,
  };
}
