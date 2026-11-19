import "server-only";

import { clubLabel } from "@/lib/clubs/labels";
import type { FixtureRecord } from "@/lib/fixtures/store";
import { coversRound } from "@/lib/memberships/from";
import { createUserClient } from "@/lib/pb/server";

import { feedName, rowsFromLive, rowsFromStored, type BoxRow, type StoredBoxRow } from "./game-box";
import { gameStateOf, type GameState } from "./status";
import { readLiveSnapshot, type StoredSnapshot } from "./store";
import { tickerFixtures, tickerSnapshotOf, type TickerFixture, type TickerSnapshot } from "./ticker";

export type GameBox = {
  readonly fixture: FixtureRecord;
  readonly homeName: string;
  readonly awayName: string;
  readonly state: GameState;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** Points per period, while the live feed has them. */
  readonly quarters: { readonly local: readonly number[]; readonly road: readonly number[] } | null;
  readonly period: number | null;
  readonly clock: string | null;
  /** Where the rows came from: the finished-game record, the live feed, or nobody yet. */
  readonly source: "recorded" | "live" | "none";
  readonly checkedAt: string | null;
  readonly rows: readonly BoxRow[];
  /** Person code → the player's id and slug, for a link to their page. */
  readonly players: Readonly<Record<string, { readonly id: string; readonly slug?: string }>>;
  /** Person code → the league member who holds the player this round. */
  readonly owners: Readonly<Record<string, string>>;
};

type PlayerRow = { id: string; person_code?: string; name: string; slug?: string; club_code?: string; club_name?: string; dorsal?: string };

/**
 * One game's box score. A recorded box score is the final word, so once the
 * stats pass has written the game it replaces the live feed's last snapshot;
 * until then the snapshot is shown, provisional, as the Live page shows it.
 */
export async function readGameBox(input: {
  season: string;
  gameCode: number;
  token: string;
  leagueId?: string | null;
  basketNews?: boolean;
}): Promise<GameBox | null> {
  const pb = createUserClient(input.token);
  const fixtures = await pb.collection("fixtures").getFullList<FixtureRecord>({
    filter: `season = '${input.season}' && game_code = ${input.gameCode}`,
    requestKey: null,
  });
  const fixture = fixtures[0];
  if (!fixture) return null;

  const [snapshot, recorded, clubPlayers, memberships] = await Promise.all([
    readLiveSnapshot(pb, input.season, input.gameCode),
    pb.collection("player_game_stats").getFullList<StoredBoxRow>({
      filter: `season = '${input.season}' && game_code = ${input.gameCode}`,
      requestKey: null,
    }),
    pb.collection("players").getFullList<PlayerRow>({
      filter: `club_code = '${fixture.local_club}' || club_code = '${fixture.road_club}'`,
      fields: "id,person_code,name,slug,club_code,club_name,dorsal",
      requestKey: null,
    }),
    input.leagueId
      ? pb.collection("roster_memberships").getFullList<{ member: string; player: string; from_round?: number | null; to_round?: number | null; to_date?: string | null }>({
        filter: `league = '${input.leagueId}'`,
        fields: "member,player,from_round,to_round,to_date",
        requestKey: null,
      })
      : Promise.resolve([]),
  ]);

  // A recorded row can name a player who has since moved club; fetch those by id.
  const known = new Map(clubPlayers.map((player) => [player.id, player]));
  const missing = recorded.map((row) => row.player).filter((id) => !known.has(id));
  if (missing.length > 0) {
    const moved = await pb.collection("players").getFullList<PlayerRow>({
      filter: missing.map((id) => `id = '${id}'`).join(" || "),
      fields: "id,person_code,name,slug,club_code,club_name,dorsal",
      requestKey: null,
    });
    for (const player of moved) known.set(player.id, player);
  }
  const byPerson = new Map([...known.values()].flatMap((player) => (player.person_code?.trim() ? [[player.person_code.trim(), player] as const] : [])));

  const played = Boolean(fixture.played);
  const useRecorded = played && recorded.length > 0;
  const rows = useRecorded
    ? rowsFromStored(recorded, new Map([...known.values()].map((player) => [player.id, { name: player.name, personCode: player.person_code?.trim() || player.id, dorsal: player.dorsal ?? "" }])), { basketNews: input.basketNews })
    : snapshot
      ? rowsFromLive(snapshot.players, { basketNews: input.basketNews, names: new Map([...byPerson].map(([code, player]) => [code, player.name])) })
      : [];

  const now = Date.now();
  const state = gameStateOf({ played, snapshot: snapshot ?? undefined, now });
  const fromFeed = snapshot && !played;
  const feedTeams = snapshot?.detail?.teams;
  const clubName = (code: string, fromFeed: string | undefined) =>
    clubPlayers.find((player) => player.club_code === code && player.club_name)?.club_name ?? (fromFeed ? feedName(fromFeed) : clubLabel(code));

  const ownerOf = new Map<string, string>();
  for (const window of memberships) if (coversRound(window, fixture.round)) ownerOf.set(window.player, window.member);
  const owners: Record<string, string> = {};
  const players: Record<string, { id: string; slug?: string }> = {};
  for (const row of rows) {
    const player = byPerson.get(row.personCode) ?? known.get(row.personCode);
    if (!player) continue;
    players[row.personCode] = { id: player.id, slug: player.slug };
    const owner = ownerOf.get(player.id);
    if (owner) owners[row.personCode] = owner;
  }

  return {
    fixture,
    homeName: clubName(fixture.local_club, feedTeams?.local),
    awayName: clubName(fixture.road_club, feedTeams?.road),
    state,
    homeScore: fromFeed ? snapshot.localScore : played ? fixture.local_score ?? 0 : null,
    awayScore: fromFeed ? snapshot.roadScore : played ? fixture.road_score ?? 0 : null,
    quarters: snapshot?.detail?.quarters ?? null,
    period: fromFeed ? snapshot.detail?.period ?? null : null,
    clock: fromFeed ? snapshot.detail?.clock ?? null : null,
    source: useRecorded ? "recorded" : snapshot ? "live" : "none",
    checkedAt: snapshot?.checked_at ?? null,
    rows,
    players,
    owners,
  };
}

/** One of the viewer's own teams holding a player in this game's round. */
export type Holding = { readonly leagueId: string; readonly league: string; readonly team: string };

/**
 * Which of these players the viewer holds, in any of their leagues, for the
 * given round: player id → every league and team that does. Two reads with the
 * viewer's own token, so a league they cannot see never answers. An empty
 * answer, never a thrown one — the mark is a nicety on a page that stands
 * without it.
 */
export async function readYourHoldings(input: {
  token: string;
  userId: string;
  round: number;
  playerIds: readonly string[];
}): Promise<Record<string, Holding[]>> {
  if (input.playerIds.length === 0) return {};
  const pb = createUserClient(input.token);
  try {
    const teams = await pb.collection("league_members").getFullList<{
      id: string;
      team_name?: string;
      league: string;
      expand?: { league?: { name?: string } };
    }>({
      filter: pb.filter("user = {:user}", { user: input.userId }),
      expand: "league",
      fields: "id,team_name,league,expand.league.name",
      requestKey: null,
    });
    if (teams.length === 0) return {};
    const players = new Set(input.playerIds);
    const windows = await pb.collection("roster_memberships").getFullList<{
      member: string;
      player: string;
      from_round?: number | null;
      to_round?: number | null;
      to_date?: string | null;
    }>({
      filter: teams.map((team) => `member = '${team.id}'`).join(" || "),
      fields: "member,player,from_round,to_round,to_date",
      requestKey: null,
    });
    const byId = new Map(teams.map((team) => [team.id, team]));
    const held: Record<string, Holding[]> = {};
    for (const window of windows) {
      const team = byId.get(window.member);
      if (!team || !players.has(window.player) || !coversRound(window, input.round)) continue;
      const list = (held[window.player] ??= []);
      if (list.some((holding) => holding.leagueId === team.league)) continue;
      list.push({ leagueId: team.league, league: team.expand?.league?.name ?? "A league", team: team.team_name?.trim() || "Your team" });
    }
    return held;
  } catch {
    return {};
  }
}

export type TickerData = {
  readonly season: string;
  readonly renderedAt: number;
  readonly fixtures: readonly TickerFixture[];
  readonly snapshots: readonly TickerSnapshot[];
};

/**
 * The shell's strip of tonight's games, or null on a day without any. Two
 * small reads; the caller hides the strip if either fails.
 */
export async function readTicker(token: string, season: string, now = Date.now()): Promise<TickerData | null> {
  const pb = createUserClient(token);
  const day = (at: number) => new Date(at).toISOString().slice(0, 10);
  const nearby = await pb.collection("fixtures").getFullList<FixtureRecord>({
    filter: `season = '${season}' && utc_date >= '${day(now - 86_400_000)}' && utc_date < '${day(now + 2 * 86_400_000)}'`,
    fields: "game_code,local_club,road_club,played,local_score,road_score,utc_date",
    requestKey: null,
  });
  const fixtures = tickerFixtures(nearby, now);
  if (fixtures.length === 0) return null;
  const snapshots = await pb.collection("live_game_snapshots").getFullList<StoredSnapshot>({
    filter: `season = '${season}' && (${fixtures.map((game) => `game_code = ${game.game_code}`).join(" || ")})`,
    fields: "id,season,game_code,round,live,local_score,road_score,checked_at,detail",
    requestKey: null,
  });
  return { season, renderedAt: now, fixtures, snapshots: snapshots.map(tickerSnapshotOf) };
}
