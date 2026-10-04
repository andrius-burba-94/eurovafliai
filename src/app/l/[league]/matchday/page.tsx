import { displayName } from "@/lib/players/name";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice, PositionPatch } from "@/components/board";
import {
  GAME_BADGE,
  PageHeader,
  RoundStepper,
  ScoreFigure,
  StatusBadge,
  TeamCrest,
  teamFieldStyle,
} from "@/components/broadcast";
import { GameTile, gameScores } from "@/components/game-tile";
import { LiveFeed } from "@/components/live-feed";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { TeamPicker } from "@/components/team-picker";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { ROLE_MULTIPLIERS, ROLE_WORDS } from "@/lib/lineups/lineup";
import { readLineupBoard } from "@/lib/lineups/queries";
import { readMatchdayData } from "@/lib/live/queries";
import { gameStateOf, playerRoundOf, statLineOf, type GameState } from "@/lib/live/status";
import { navLeagueFrom } from "@/lib/nav/items";
import { ordinal } from "@/lib/season/story";
import { formatHundredths } from "@/lib/stats/scoring";
import { stylesById } from "@/lib/teams/identity";
import { formatClock } from "@/lib/time/local";
import { leagueHref } from "@/lib/nav/urls";

/** The regular season's rounds; the stepper walks them. */
const REGULAR_SEASON_ROUNDS = 38;

function requestedRound(value: string | string[] | undefined): number | null {
  const round = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(round) && round > 0 ? round : null;
}

/**
 * Live (Matchday) — ADR-0011. A scoreboard: a team's round total and live rank
 * first, then its five with each player's counted points, then the games and
 * the provisional table. Every live figure says it is provisional until the
 * finished-game pipeline has recorded the round.
 *
 * It opens on your team; any member can watch another one, from the picker or
 * by tapping its row in the table. Watching reads, never writes, so unlike the
 * lineup page there is no permission to check beyond being in the league.
 */
export default async function MatchdayPage({ params, searchParams }: PageProps<"/l/[league]/matchday">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { league: leagueRef } = await params;
  const query = await searchParams;
  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const base = leagueHref(data.league);
  if (data.league.basketnews_team_id) redirect(`${base}/standings`);
  const you = data.members.find((member) => member.isYou);
  if (!you || (data.league.status !== "season" && data.league.status !== "complete")) notFound();
  const season = serverConfig().EUROLEAGUE_SEASON;
  const matchday = await readMatchdayData({
    leagueId: id,
    memberIds: data.members.map((member) => member.id),
    season,
    requestedRound: requestedRound(query.round),
    token: session.token,
  });
  const asked = typeof query.member === "string" ? query.member : you.id;
  const watched = data.members.find((member) => member.id === asked) ?? you;
  const watchingYou = watched.id === you.id;
  const canManage = data.isCommissioner || you.canManage;
  const board = await readLineupBoard({ leagueId: id, memberId: watched.id, season, round: matchday.round });
  const hrefFor = (next: { round?: number; member?: string }) => {
    const params = new URLSearchParams({ round: String(next.round ?? matchday.round) });
    const member = next.member ?? watched.id;
    if (member !== you.id) params.set("member", member);
    return `${base}/matchday?${params}`;
  };
  const byGame = new Map(matchday.snapshots.map((row) => [row.game_code, row]));
  const now = Date.parse(matchday.fetchedAt);
  const hasGameWindow = matchday.fixtures.some((game) => {
    const tip = Date.parse(game.utc_date ?? "");
    return Number.isFinite(tip) && now >= tip - 5 * 60_000 && now < tip + 4 * 60 * 60_000;
  });
  const watchedRank = matchday.hasScoringBasis ? matchday.ranks.find((row) => row.memberId === watched.id) : undefined;
  const hasLiveScores = matchday.snapshots.some((row) => row.live);
  const hasRoundScores = matchday.ranks.some((row) => row.roundHundredths !== 0);
  const styles = stylesById(data.members);
  const watchedStyle = styles[watched.id];
  const teamName = (memberId: string) => {
    const member = data.members.find((row) => row.id === memberId);
    return member?.teamName || member?.name || "Team";
  };

  const gameState = (gameCode: number, played: boolean): GameState =>
    gameStateOf({ played, snapshot: byGame.get(gameCode), now });
  const hasFullTime = matchday.fixtures.some((game) => gameState(game.game_code, Boolean(game.played)) === "fulltime");

  const players = [...(board?.players ?? [])]
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || a.name.localeCompare(b.name))
    .map((player) => {
      const { fixture, state, tenths: raw } = playerRoundOf({
        clubCode: player.clubCode,
        fixtures: matchday.fixtures,
        snapshots: byGame,
        tenths: matchday.scoresByPlayer[player.id] ?? null,
        now,
      });
      const multiplier = player.role ? ROLE_MULTIPLIERS[player.role] : 1;
      const line = matchday.statsByPlayer[player.id];
      return { player, fixture, state, raw, counted: raw === null ? null : raw * multiplier, multiplier, statLine: line ? statLineOf(line) : null };
    });
  const counting = players.filter((row) => row.multiplier > 0);
  const finished = counting.filter((row) => row.state === "final" || row.state === "fulltime").length;
  const playing = counting.filter((row) => row.state === "live" || row.state === "stale").length;
  const toPlay = counting.filter((row) => row.state === "scheduled" || row.state === null).length;
  const statusWord = matchday.final
    ? "Final"
    : !matchday.hasScoringBasis
      ? "Waiting for scores"
      : hasLiveScores
        ? "Provisional live rank"
        : hasRoundScores
          ? "Provisional rank"
          : "Rank before this round";

  return (
    <AppShell current="matchday" league={navLeagueFrom(data)} measure="wide" testId="matchday">
      <PageHeader
        eyebrow={data.league.name}
        title="Live"
        action={
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <TeamPicker
              action={`${base}/matchday`}
              keep={{ round: String(matchday.round) }}
              members={data.members}
              value={watched.id}
              testId="matchday"
            />
            <RoundStepper
              round={matchday.round}
              max={Math.max(REGULAR_SEASON_ROUNDS, matchday.round)}
              hrefFor={(round) => hrefFor({ round })}
            />
          </div>
        }
      />

      <section
        aria-label={`${teamName(watched.id)}, matchday status`}
        data-testid="matchday-scoreboard"
        data-member={watched.id}
        className="team-field relative overflow-hidden rounded-card border border-panel-border p-4 sm:p-6"
        style={watchedStyle ? teamFieldStyle(watchedStyle.color) : undefined}
      >
        <div aria-hidden="true" className="lattice pointer-events-none absolute inset-0" />
        <div className="relative flex flex-col gap-4">
          <div className="flex min-w-0 items-center gap-3">
            {watchedStyle ? <TeamCrest name={teamName(watched.id)} color={watchedStyle.color} shape={watchedStyle.crest} size={44} /> : null}
            <div className="min-w-0">
              <p className="slot-label">{watchingYou ? "Your team" : "Watching"}</p>
              <p className="display truncate text-2xl sm:text-3xl" data-testid="matchday-team">{teamName(watched.id)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {matchday.final ? (
              <StatusBadge kind="final">Final · round {matchday.round}</StatusBadge>
            ) : hasLiveScores ? (
              <StatusBadge kind="live">Live · round {matchday.round}</StatusBadge>
            ) : (
              <StatusBadge kind="provisional">Round {matchday.round}</StatusBadge>
            )}
            <LiveFeed
              authToken={session.token}
              season={season}
              round={matchday.round}
              checkedAt={matchday.snapshots.filter((row) => row.live).map((row) => row.checked_at)}
              final={matchday.final}
              hasGameWindow={hasGameWindow}
              gameTimes={matchday.fixtures.map((game) => game.utc_date ?? "")}
              hasPlayedGames={matchday.fixtures.some((game) => game.played)}
              hasFullTime={hasFullTime}
            />
          </div>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <p className="slot-label">This round</p>
              <ScoreFigure size="xl" testId="matchday-total">
                {watchedRank ? formatHundredths(watchedRank.roundHundredths) : "—"}
              </ScoreFigure>
            </div>
            <div className="pb-1">
              <p className="slot-label">{statusWord}</p>
              <p className="display text-3xl">
                {watchedRank ? `${ordinal(watchedRank.rank)} of ${matchday.ranks.length}` : "No score yet"}
              </p>
            </div>
          </div>
          {counting.length > 0 ? (
            <p className="flex flex-wrap gap-2 text-xs font-semibold">
              <span className="rounded-full bg-stock-high px-2.5 py-1 text-ink-soft">{finished} finished</span>
              <span className={`rounded-full px-2.5 py-1 ${playing > 0 ? "bg-on-air text-on-air-ink" : "bg-stock-high text-ink-soft"}`}>
                {playing} playing now
              </span>
              <span className="rounded-full bg-stock-high px-2.5 py-1 text-ink-soft">{toPlay} still to play</span>
            </p>
          ) : null}
          <p className="text-xs text-ink-soft">
            {matchday.final
              ? "Finished-game standings are authoritative."
              : "Provisional until finished games are recorded."}
          </p>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.5fr)_minmax(18rem,1fr)] xl:items-start">
        <Bank framed label={watchingYou ? "Your lineup" : `${teamName(watched.id)} lineup`} aside={board?.source === "recorded" ? "Recorded" : "Everyone at 100%"}>
          {players.length === 0 ? (
            <EmptyNotice>
              {watchingYou ? "Your roster and lineup appear here after the draft." : `${teamName(watched.id)} has nobody on its roster for this round.`}
            </EmptyNotice>
          ) : (
            <ul role="list" className="flex flex-col divide-y divide-panel-border">
              {players.map(({ player, fixture, state, raw, counted, multiplier, statLine }) => {
                const captain = player.role === "captain";
                const progress =
                  raw !== null && player.estimateTenths && player.estimateTenths > 0
                    ? Math.max(0, Math.min(100, Math.round((raw / player.estimateTenths) * 100)))
                    : null;
                return (
                  <li
                    key={player.id}
                    data-testid="matchday-player"
                    data-role={player.role ?? undefined}
                    className={`flex items-center gap-3 py-3 ${multiplier === 0 ? "opacity-60" : ""}`}
                  >
                    <span className="relative shrink-0">
                      <PlayerPortrait personCode={player.personCode} name={player.name} />
                      {captain ? (
                        <span className="absolute -top-1.5 -left-1.5 rounded bg-gold px-1 text-[0.625rem] leading-4 font-extrabold text-[oklch(0.22_0.04_80)]">
                          C×2
                        </span>
                      ) : null}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="truncate text-sm font-semibold">{displayName(player.name)}</span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-soft">
                        <PositionPatch position={player.position} />
                        <span className={captain ? "font-semibold text-gold" : ""}>
                          {player.role ? ROLE_WORDS[player.role] : "Counted at 100%"}
                        </span>
                        <span className="flex items-center gap-1">
                          <ClubCrest clubCode={player.clubCode} />
                          {fixture ? `${fixture.local_club} v ${fixture.road_club}` : "No game this round"}
                        </span>
                        {state === "scheduled" && fixture?.utc_date ? <span>{formatClock(fixture.utc_date)}</span> : null}
                      </span>
                      {statLine ? (
                        <span className="stat text-xs text-ink-soft" data-testid="matchday-stat-line">
                          {statLine}
                        </span>
                      ) : null}
                      {progress !== null && multiplier > 0 ? (
                        <span
                          className="mt-1 block h-1.5 w-full max-w-48 overflow-hidden rounded-full bg-stock-high"
                          role="img"
                          aria-label={`${progress}% of recent fantasy average`}
                        >
                          <span className={`block h-full ${captain ? "bg-gold" : "bg-live"}`} style={{ width: `${progress}%` }} />
                        </span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <ScoreFigure size="sm">{counted !== null ? (counted / 10).toFixed(1) : "—"}</ScoreFigure>
                      {state ? <StatusBadge kind={GAME_BADGE[state].kind}>{GAME_BADGE[state].word}</StatusBadge> : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          {watchingYou || canManage ? (
            <Link
              href={`${base}/lineup?${new URLSearchParams({ round: String(matchday.round), ...(watchingYou ? {} : { member: watched.id }) })}`}
              className="inline-flex min-h-11 items-center text-sm font-semibold text-live hover:underline"
            >
              {watchingYou ? "Review lineup" : "Open their lineup"} &rarr;
            </Link>
          ) : null}
        </Bank>

        <div className="flex min-w-0 flex-col gap-6">
          <Bank framed label="Games" aside={`${matchday.fixtures.length} games · Vilnius time`}>
            {matchday.fixtures.length === 0 ? (
              <EmptyNotice>The schedule for this round is not available yet.</EmptyNotice>
            ) : (
              <ul role="list" className="grid grid-cols-2 gap-2">
                {matchday.fixtures.map((fixture) => {
                  const scores = gameScores({
                    snapshot: byGame.get(fixture.game_code),
                    played: Boolean(fixture.played),
                    localScore: fixture.local_score ?? 0,
                    roadScore: fixture.road_score ?? 0,
                  });
                  return (
                    <GameTile
                      key={fixture.id}
                      testId="matchday-game"
                      state={gameState(fixture.game_code, Boolean(fixture.played))}
                      tipOff={fixture.utc_date || null}
                      home={{ code: fixture.local_club, score: scores.home }}
                      away={{ code: fixture.road_club, score: scores.away }}
                    />
                  );
                })}
              </ul>
            )}
          </Bank>

          <Bank framed label={matchday.final ? "Final table" : hasRoundScores ? "Provisional table" : "League table"}>
            {!matchday.hasScoringBasis ? (
              <EmptyNotice>The league table appears when scores are recorded.</EmptyNotice>
            ) : (
              <ol className="flex flex-col divide-y divide-panel-border">
                {matchday.ranks.map((row) => {
                  const style = styles[row.memberId];
                  const mine = row.memberId === you.id;
                  const shown = row.memberId === watched.id;
                  return (
                    <li key={row.memberId}>
                      <Link
                        href={hrefFor({ member: row.memberId })}
                        aria-current={shown ? "true" : undefined}
                        aria-label={`Watch ${teamName(row.memberId)}, ${ordinal(row.rank)}`}
                        data-testid="matchday-table-team"
                        className={`-mx-2 flex min-h-11 items-center gap-2.5 rounded-md px-2 text-sm transition-colors hover:bg-stock-high focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live ${mine ? "font-semibold" : ""} ${shown ? "bg-live-sunk" : ""}`}
                      >
                        <span className="stat w-5 text-ink-faint">{row.rank}</span>
                        {style ? <TeamCrest name={teamName(row.memberId)} color={style.color} shape={style.crest} size={22} /> : null}
                        <span className={`min-w-0 flex-1 truncate ${shown ? "text-live" : ""}`}>
                          {teamName(row.memberId)}
                          {mine && !shown ? <span className="ml-1.5 text-xs font-normal text-ink-soft">you</span> : null}
                        </span>
                        <span className="stat text-xs text-ink-soft">{formatHundredths(row.roundHundredths)}</span>
                        <span className="stat w-16 text-right">{formatHundredths(row.totalHundredths)}</span>
                      </Link>
                    </li>
                  );
                })}
              </ol>
            )}
          </Bank>
        </div>
      </div>
    </AppShell>
  );
}

function roleOrder(role: string | null): number {
  return ({ captain: 0, starter: 1, sixth: 2, bench: 3, inactive: 4 } as Record<string, number>)[role ?? ""] ?? 5;
}
