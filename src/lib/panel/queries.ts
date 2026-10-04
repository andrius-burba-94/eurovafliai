import "server-only";

import { getSession } from "@/lib/auth/session";
import { DRAFTABLE_PLAYERS_FILTER } from "@/lib/drafts/pipeline";
import { nextFixturesByClub, roundSchedule } from "@/lib/fixtures/schedule";
import { readStoredFixtures, scheduleRowsFrom } from "@/lib/fixtures/store";
import { gameScores } from "@/components/game-tile";
import { gameStateOf } from "@/lib/live/status";
import { readLiveSnapshots } from "@/lib/live/store";
import { readNews } from "@/lib/news/queries";
import { createUserClient } from "@/lib/pb/server";
import { toPoolPlayer, type PoolPlayerRecord } from "@/lib/pool/rows";
import type { PoolPlayer } from "@/lib/pool/search";

import type { PanelData } from "./types";

/**
 * The side panel's three tabs, read once for the page that shows it — slice
 * 11.2, ADR-0008.
 *
 * With the viewer's token, like every other read. Each part fails on its own:
 * a panel whose news could not be read still has a pool and a schedule, and
 * none of the three is worth failing the page it sits beside.
 */
export async function readPanel({
  leagueId,
  season,
  teamNames = {},
  round,
  pool,
  basketNews = false,
}: {
  leagueId: string;
  season: string;
  /** Member id → the name the league calls them, for "held by". */
  teamNames?: Readonly<Record<string, string>>;
  /** The round the page is about; the next one to be played if absent. */
  round?: number;
  /**
   * The pool the page has already read, holders and all. The draft room has
   * one and refreshes on every pick, so it should not pay for a second.
   */
  pool?: readonly PoolPlayer[];
  basketNews?: boolean;
}): Promise<PanelData> {
  const session = await getSession();
  if (!session) return { players: [], fixtures: {}, schedule: null, news: [] };
  const pb = createUserClient(session.token);

  const [players, fixtureRows, news] = await Promise.all([
    pool ? Promise.resolve(pool) : readPool(pb, leagueId, teamNames, basketNews),
    readStoredFixtures(pb, season)
      .then(scheduleRowsFrom)
      .catch(() => []),
    readNews(15).catch(() => null),
  ]);

  const schedule = roundSchedule(fixtureRows, round);
  const snapshots = new Map(
    (schedule ? await readLiveSnapshots(pb, season, schedule.round).catch(() => []) : []).map((row) => [row.game_code, row]),
  );
  const now = Date.now();
  const clubNames = new Map(
    players.map((player) => [player.club, player.clubName ?? player.club]),
  );

  return {
    players,
    fixtures: Object.fromEntries(nextFixturesByClub(fixtureRows)),
    schedule: schedule
      ? {
          round: schedule.round,
          games: schedule.games.map((game) => {
            const snapshot = snapshots.get(game.gameCode);
            const scores = gameScores({ snapshot, played: game.played, localScore: game.localScore, roadScore: game.roadScore });
            return {
              code: game.gameCode,
              home: game.localClub,
              away: game.roadClub,
              homeName: clubNames.get(game.localClub) ?? game.localClub,
              awayName: clubNames.get(game.roadClub) ?? game.roadClub,
              state: gameStateOf({ played: game.played, snapshot, now }),
              homeScore: scores.home,
              awayScore: scores.away,
              tipOff: game.utcDate,
            };
          }),
        }
      : null,
    news: (news ?? []).map((item) => ({
      id: item.id,
      name: item.name,
      status: item.status,
      headline: item.headline,
      url: item.url,
      published: item.published,
      playerId: item.player?.id ?? null,
    })),
  };
}

async function readPool(
  pb: ReturnType<typeof createUserClient>,
  leagueId: string,
  teamNames: Readonly<Record<string, string>>,
  basketNews: boolean,
): Promise<PoolPlayer[]> {
  const [players, held] = await Promise.all([
    pb
      .collection("players")
      .getFullList<PoolPlayerRecord>({
        filter: DRAFTABLE_PLAYERS_FILTER,
        sort: "name",
        requestKey: null,
      })
      .catch(() => []),
    pb
      .collection("roster_memberships")
      .getFullList<{
        player: string;
        member: string;
        to_round?: number | null;
        to_date?: string | null;
      }>({
        filter: `league = '${leagueId}'`,
        fields: "player,member,to_round,to_date",
        requestKey: null,
      })
      .catch(() => []),
  ]);
  const holder = new Map(
    held
      .filter((row) => !row.to_round && !row.to_date)
      .map((row) => [
        row.player,
        { by: teamNames[row.member] ?? "Another team", at: null },
      ]),
  );
  return players.map((player) => toPoolPlayer(player, holder.get(player.id), basketNews));
}
