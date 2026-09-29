import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice, PositionPatch } from "@/components/board";
import {
  PageHeader,
  RoundStepper,
  ScoreFigure,
  StatusBadge,
  TeamCrest,
  type BadgeKind,
} from "@/components/broadcast";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { ROLE_MULTIPLIERS, ROLE_WORDS } from "@/lib/lineups/lineup";
import { readLineupBoard } from "@/lib/lineups/queries";
import { readMatchdayData } from "@/lib/live/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { ordinal } from "@/lib/season/story";
import { formatHundredths } from "@/lib/stats/scoring";
import { stylesById } from "@/lib/teams/identity";
import { formatClock, formatTipOff } from "@/lib/time/local";

import { MatchdayLive } from "./matchday-live";

/** The regular season's rounds; the stepper walks them. */
const REGULAR_SEASON_ROUNDS = 38;

function requestedRound(value: string | string[] | undefined): number | null {
  const round = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(round) && round > 0 ? round : null;
}

type GameState = "final" | "live" | "stale" | "unavailable" | "scheduled";

const GAME_BADGE: Record<GameState, { kind: BadgeKind; word: string }> = {
  final: { kind: "final", word: "Final" },
  live: { kind: "live", word: "Live" },
  stale: { kind: "doubtful", word: "Feed stale" },
  unavailable: { kind: "provisional", word: "Feed unavailable" },
  scheduled: { kind: "scheduled", word: "Scheduled" },
};

/**
 * Live (Matchday) — ADR-0011. A scoreboard: your round total and live rank
 * first, then your five with each player's counted points, then the games and
 * the provisional table. Every live figure says it is provisional until the
 * finished-game pipeline has recorded the round.
 */
export default async function MatchdayPage({ params, searchParams }: PageProps<"/leagues/[id]/matchday">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  const { id } = await params;
  const query = await searchParams;
  const data = await getLeagueWithMembers(id);
  if (!data) notFound();
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
  const board = await readLineupBoard({ leagueId: id, memberId: you.id, season, round: matchday.round });
  const byGame = new Map(matchday.snapshots.map((row) => [row.game_code, row]));
  const now = Date.parse(matchday.fetchedAt);
  const hasGameWindow = matchday.fixtures.some((game) => {
    const tip = Date.parse(game.utc_date ?? "");
    return Number.isFinite(tip) && now >= tip - 5 * 60_000 && now < tip + 4 * 60 * 60_000;
  });
  const yourRank = matchday.hasScoringBasis ? matchday.ranks.find((row) => row.memberId === you.id) : undefined;
  const hasLiveScores = matchday.snapshots.some((row) => row.live);
  const hasRoundScores = matchday.ranks.some((row) => row.roundHundredths !== 0);
  const styles = stylesById(data.members);
  const teamName = (memberId: string) => {
    const member = data.members.find((row) => row.id === memberId);
    return member?.teamName || member?.name || "Team";
  };

  const gameState = (gameCode: number, played: boolean): GameState => {
    const snapshot = byGame.get(gameCode);
    if (played) return "final";
    if (snapshot?.live) return now - Date.parse(snapshot.checked_at) > 5 * 60_000 ? "stale" : "live";
    return snapshot ? "unavailable" : "scheduled";
  };

  const players = [...(board?.players ?? [])]
    .sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || a.name.localeCompare(b.name))
    .map((player) => {
      const fixture = matchday.fixtures.find((game) => game.local_club === player.clubCode || game.road_club === player.clubCode);
      const state: GameState | null = fixture ? gameState(fixture.game_code, Boolean(fixture.played)) : null;
      const raw = matchday.scoresByPlayer[player.id] ?? null;
      const multiplier = player.role ? ROLE_MULTIPLIERS[player.role] : 1;
      return { player, fixture, state, raw, counted: raw === null ? null : raw * multiplier, multiplier };
    });
  const counting = players.filter((row) => row.multiplier > 0);
  const finished = counting.filter((row) => row.state === "final").length;
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
          <RoundStepper
            round={matchday.round}
            max={Math.max(REGULAR_SEASON_ROUNDS, matchday.round)}
            hrefFor={(round) => `/leagues/${id}/matchday?round=${round}`}
          />
        }
      />

      <section
        aria-label="Matchday status"
        data-testid="matchday-scoreboard"
        className="relative overflow-hidden rounded-card border border-panel-border bg-stock-panel p-4 sm:p-6"
      >
        <div aria-hidden="true" className="lattice pointer-events-none absolute inset-0" />
        <div className="relative flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {matchday.final ? (
              <StatusBadge kind="final">Final · round {matchday.round}</StatusBadge>
            ) : hasLiveScores ? (
              <StatusBadge kind="live">Live · round {matchday.round}</StatusBadge>
            ) : (
              <StatusBadge kind="provisional">Round {matchday.round}</StatusBadge>
            )}
            <MatchdayLive
              authToken={session.token}
              season={season}
              round={matchday.round}
              checkedAt={matchday.snapshots.filter((row) => row.live).map((row) => row.checked_at)}
              final={matchday.final}
              hasGameWindow={hasGameWindow}
              gameTimes={matchday.fixtures.map((game) => game.utc_date ?? "")}
              hasPlayedGames={matchday.fixtures.some((game) => game.played)}
            />
          </div>
          <div className="flex flex-wrap items-end gap-x-10 gap-y-3">
            <div>
              <p className="slot-label">This round</p>
              <ScoreFigure size="xl" testId="matchday-total">
                {yourRank ? formatHundredths(yourRank.roundHundredths) : "—"}
              </ScoreFigure>
            </div>
            <div className="pb-1">
              <p className="slot-label">{statusWord}</p>
              <p className="display text-3xl">
                {yourRank ? `${ordinal(yourRank.rank)} of ${matchday.ranks.length}` : "No score yet"}
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
        <Bank framed label="Your lineup" aside={board?.source === "recorded" ? "Recorded" : "Everyone at 100%"}>
          {players.length === 0 ? (
            <EmptyNotice>Your roster and lineup appear here after the draft.</EmptyNotice>
          ) : (
            <ul role="list" className="flex flex-col divide-y divide-panel-border">
              {players.map(({ player, fixture, state, raw, counted, multiplier }) => {
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
                      <span className="truncate text-sm font-semibold">{player.name}</span>
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
          <Link
            href={`/leagues/${id}/lineup?round=${matchday.round}`}
            className="inline-flex min-h-11 items-center text-sm font-semibold text-live hover:underline"
          >
            Review lineup &rarr;
          </Link>
        </Bank>

        <div className="flex min-w-0 flex-col gap-6">
          <Bank framed label="Games" aside={`${matchday.fixtures.length} games · Vilnius time`}>
            {matchday.fixtures.length === 0 ? (
              <EmptyNotice>The schedule for this round is not available yet.</EmptyNotice>
            ) : (
              <ul role="list" className="grid grid-cols-2 gap-2">
                {matchday.fixtures.map((fixture) => {
                  const state = gameState(fixture.game_code, Boolean(fixture.played));
                  const snapshot = byGame.get(fixture.game_code);
                  const score = (side: "local" | "road") =>
                    snapshot
                      ? side === "local"
                        ? snapshot.localScore
                        : snapshot.roadScore
                      : fixture.played
                        ? side === "local"
                          ? fixture.local_score
                          : fixture.road_score
                        : null;
                  return (
                    <li key={fixture.id} data-testid="matchday-game" className="flex flex-col gap-1.5 rounded-lg border border-panel-border bg-stock p-2.5">
                      <span className="flex items-center justify-between gap-2">
                        <StatusBadge kind={GAME_BADGE[state].kind}>{GAME_BADGE[state].word}</StatusBadge>
                        {state === "scheduled" ? (
                          <span className="text-xs text-ink-soft">{formatTipOff(fixture.utc_date) ?? "Time to be confirmed"}</span>
                        ) : null}
                      </span>
                      {(["local", "road"] as const).map((side) => (
                        <span key={side} className="flex items-center justify-between gap-2">
                          <span className="flex items-center gap-1.5 text-sm font-bold">
                            <ClubCrest clubCode={side === "local" ? fixture.local_club : fixture.road_club} />
                            {side === "local" ? fixture.local_club : fixture.road_club}
                          </span>
                          <span className="stat text-sm font-bold">{score(side) ?? ""}</span>
                        </span>
                      ))}
                    </li>
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
                  return (
                    <li key={row.memberId} className={`flex items-center gap-2.5 py-2 text-sm ${mine ? "font-semibold" : ""}`}>
                      <span className="stat w-5 text-ink-faint">{row.rank}</span>
                      {style ? <TeamCrest name={teamName(row.memberId)} color={style.color} shape={style.crest} size={22} /> : null}
                      <span className={`min-w-0 flex-1 truncate ${mine ? "text-live" : ""}`}>{teamName(row.memberId)}</span>
                      <span className="stat text-xs text-ink-soft">{formatHundredths(row.roundHundredths)}</span>
                      <span className="stat w-16 text-right">{formatHundredths(row.totalHundredths)}</span>
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
