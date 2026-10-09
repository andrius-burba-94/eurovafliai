import type PocketBase from "pocketbase";

import type { Position } from "@/lib/engine";
import { roundProgress } from "@/lib/fixtures/progress";
import { readStoredFixtures, scheduleRowsFrom } from "@/lib/fixtures/store";
import { readRecordedLineups } from "@/lib/lineups/store";
import type { HistoryRow } from "@/lib/memberships/history";
import { PHASES, snapshotRowsFrom, type Phase, type RoundSnapshot } from "@/lib/stats/standings";

import type { FactsGame, FactsOfficialRound, RoundFactsInput } from "./round-facts";

/**
 * The reads behind one round's fact sheet — slice 7.0.
 *
 * The twin of the recap page's `readLeagueRecap`, which is server-only and
 * reads with a viewer's token: this one takes the superuser client the worker
 * and the scripts hold, imports nothing from Next, and asks only filters the
 * strict test double understands (round ranges are applied here, in code).
 *
 * It refuses rather than guesses. A round that is not finished, a league not
 * in its season, or a BasketNews round its source has not finalised is not a
 * round to write about yet — a write-up built on half a round would be read as
 * the final word on it.
 */

export type RoundFactsRead =
  | {
      readonly ok: true;
      readonly input: RoundFactsInput;
      /** Member id → team name as the league reads it, for rendering tokens back. */
      readonly teamNames: Readonly<Record<string, string>>;
      /** Player id → stored name, for the same. */
      readonly playerNames: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly reason: string };

type LeagueRow = {
  id: string;
  name: string;
  status: string;
  basketnews_team_id?: string;
  basketnews_league_id?: string;
};

type MemberRow = { id: string; team_name?: string; expand?: { user?: { name?: string } } };

type StatRow = {
  player: string;
  round: number;
  game_code: number;
  club_code: string;
  team_score: number;
  opponent_score: number;
  time_played: number;
  points: number;
  reb_total: number;
  assists: number;
  pir: number;
  fantasy_pts: number;
  basketnews_raw_pts?: number;
  started?: string;
};

type PlayerRow = {
  id: string;
  name: string;
  position: Position;
  basketnews_position?: Position | "";
  club_code?: string;
  status?: string;
  prev_season_fantasy?: number;
  prev_season_games?: number;
};

const asPhase = (raw: unknown): Phase => (PHASES.includes(raw as Phase) ? (raw as Phase) : "RS");

/**
 * The rounds a league's write-ups may cover: finished by the fixtures and
 * snapshotted. `readRoundFactsInput` still has the last word on each (a
 * BasketNews round also needs its source's final), so this only narrows.
 */
export async function readCompleteRounds(
  pb: PocketBase,
  { leagueId, season, now }: { leagueId: string; season: string; now: number },
): Promise<number[]> {
  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const [snapshotRows, fixtureRows] = await Promise.all([
    pb.collection("standings_snapshots").getFullList<{ round: number }>({
      filter: `league = '${leagueId}' && season = "${code}"`,
      fields: "round",
      requestKey: null,
    }),
    readStoredFixtures(pb, code),
  ]);
  const progress = roundProgress({
    fixtures: scheduleRowsFrom(fixtureRows),
    snapshotRounds: snapshotRows.map((row) => row.round),
    now,
  });
  return [...progress.complete].sort((a, b) => a - b);
}

export async function readRoundFactsInput(
  pb: PocketBase,
  { leagueId, season, round, now }: { leagueId: string; season: string; round?: number; now: number },
): Promise<RoundFactsRead> {
  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const league = await pb
    .collection("leagues")
    .getOne<LeagueRow>(leagueId, { requestKey: null })
    .catch(() => null);
  if (!league) return { ok: false, reason: "no such league" };
  if (league.status !== "season") return { ok: false, reason: `the league is in ${league.status}, not its season` };
  const basketNews = Boolean(league.basketnews_team_id);
  if (basketNews && !league.basketnews_league_id) {
    return { ok: false, reason: "the BasketNews league has not synced yet" };
  }

  const [snapshotRows, fixtureRows] = await Promise.all([
    pb.collection("standings_snapshots").getFullList<{ round: number; phase: string; table: unknown }>({
      filter: `league = '${leagueId}' && season = "${code}"`,
      fields: "round,phase,table",
      requestKey: null,
    }),
    readStoredFixtures(pb, code),
  ]);
  const fixtures = scheduleRowsFrom(fixtureRows);
  const progress = roundProgress({ fixtures, snapshotRounds: snapshotRows.map((row) => row.round), now });
  const R = round ?? progress.lastComplete;
  if (R === null || R === undefined) return { ok: false, reason: "no round has finished yet" };
  if (!progress.complete.includes(R)) return { ok: false, reason: `round ${R} is not finished` };
  const complete = new Set(progress.complete);
  const snapshots: RoundSnapshot[] = snapshotRows
    .filter((row) => complete.has(row.round))
    .map((row) => ({ round: row.round, phase: asPhase(row.phase), table: snapshotRowsFrom(row.table) }));

  const [members, windows, lineups, transactions, stats, players, news, results] = await Promise.all([
    pb.collection("league_members").getFullList<MemberRow>({
      filter: `league = '${leagueId}'`,
      expand: "user",
      requestKey: null,
    }),
    pb.collection("roster_memberships").getFullList<{
      member: string;
      player: string;
      from_round?: number | null;
      to_round?: number | null;
      to_date?: string | null;
    }>({ filter: `league = '${leagueId}'`, fields: "member,player,from_round,to_round,to_date", requestKey: null }),
    readRecordedLineups(pb, leagueId, code),
    pb.collection("transactions").getFullList<HistoryRow>({
      filter: `league = '${leagueId}'`,
      fields: "id,type,from_round,members,players_in,players_out,note,date",
      requestKey: null,
    }),
    pb.collection("player_game_stats").getFullList<StatRow>({
      filter: `season = "${code}"`,
      fields:
        "player,round,game_code,club_code,team_score,opponent_score,time_played,points,reb_total,assists,pir,fantasy_pts,basketnews_raw_pts,started",
      requestKey: null,
    }),
    pb.collection("players").getFullList<PlayerRow>({
      fields: "id,name,position,basketnews_position,club_code,status,prev_season_fantasy,prev_season_games",
      requestKey: null,
    }),
    pb.collection("player_news").getFullList<{ player?: string; status?: string; body_part?: string; published?: string }>({
      filter: `player != ''`,
      fields: "player,status,body_part,published",
      requestKey: null,
    }),
    basketNews
      ? pb.collection("round_lineups").getFullList<{ member: string; round: number; basketnews_result?: unknown }>({
          filter: `league = '${leagueId}' && season = "${code}"`,
          fields: "member,round,basketnews_result",
          requestKey: null,
        })
      : Promise.resolve([]),
  ]);

  const official = results.flatMap((row): FactsOfficialRound[] => {
    const result = row.basketnews_result as { final?: unknown; players?: unknown } | null | undefined;
    if (!result || !Array.isArray(result.players)) return [];
    const players = result.players.flatMap((player) => {
      const entry = player as { playerId?: unknown; rawHundredths?: unknown; weightedHundredths?: unknown };
      return typeof entry.playerId === "string" && typeof entry.rawHundredths === "number" && typeof entry.weightedHundredths === "number"
        ? [{ playerId: entry.playerId, rawHundredths: entry.rawHundredths, weightedHundredths: entry.weightedHundredths }]
        : [];
    });
    return [{ memberId: row.member, round: row.round, players }];
  });
  if (basketNews) {
    const finals = new Map(
      results
        .filter((row) => row.round === R)
        .map((row) => [row.member, (row.basketnews_result as { final?: unknown } | null | undefined)?.final === true]),
    );
    if (members.some((member) => finals.get(member.id) !== true)) {
      return { ok: false, reason: `BasketNews has not finalised round ${R} for every team` };
    }
  }

  const games: FactsGame[] = stats.map((row) => ({
    player: row.player,
    round: row.round,
    gameCode: row.game_code,
    clubCode: row.club_code,
    teamScore: row.team_score,
    opponentScore: row.opponent_score,
    seconds: row.time_played,
    points: row.points,
    rebounds: row.reb_total,
    assists: row.assists,
    pir: row.pir,
    fantasyTenths: row.fantasy_pts,
    basketNewsHundredths: row.basketnews_raw_pts ?? 0,
    started: row.started === "yes" || row.started === "no" ? row.started : "",
  }));

  const teamNames = Object.fromEntries(
    members.map((member) => [member.id, member.team_name?.trim() || member.expand?.user?.name?.trim() || ""]),
  );
  const playerNames = Object.fromEntries(players.map((player) => [player.id, player.name]));
  const next = R === progress.lastComplete && progress.current && progress.current.round > R ? progress.current.round : null;

  return {
    ok: true,
    teamNames,
    playerNames,
    input: {
      round: R,
      ruleset: basketNews ? "basketnews" : "euroleague",
      leagueName: league.name,
      members: members.map((member) => ({
        id: member.id,
        teamName: member.team_name?.trim() ?? "",
        userName: member.expand?.user?.name?.trim() ?? "",
      })),
      snapshots,
      windows: windows.map((row) => ({
        memberId: row.member,
        playerId: row.player,
        from_round: row.from_round,
        to_round: row.to_round,
        to_date: row.to_date,
      })),
      lineups,
      games,
      official,
      fixtures,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        position: player.position,
        basketnewsPosition: player.basketnews_position || null,
        clubCode: player.club_code ?? "",
        status: player.status ?? "",
        prevSeasonFantasyTenths: player.prev_season_fantasy ?? 0,
        prevSeasonGames: player.prev_season_games ?? 0,
      })),
      transactions,
      news: news.flatMap((item) =>
        item.player
          ? [{ player: item.player, status: item.status ?? "", bodyPart: item.body_part ?? "", published: item.published ?? "" }]
          : [],
      ),
      nextRound: next,
    },
  };
}
