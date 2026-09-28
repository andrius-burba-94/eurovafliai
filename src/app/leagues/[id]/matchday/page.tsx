import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank, EmptyNotice, PositionPatch } from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { readLineupBoard } from "@/lib/lineups/queries";
import { readMatchdayData } from "@/lib/live/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { formatHundredths } from "@/lib/stats/scoring";

import { MatchdayLive } from "./matchday-live";

function requestedRound(value: string | string[] | undefined): number | null {
  const round = typeof value === "string" ? Number(value) : NaN;
  return Number.isInteger(round) && round > 0 ? round : null;
}

function gameTime(value: string | undefined): string {
  const date = Date.parse(value ?? "");
  return Number.isFinite(date) ? new Date(date).toISOString().slice(5, 16).replace("T", " · ") + " UTC" : "Time to be confirmed";
}

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
  return (
    <AppShell current="matchday" league={navLeagueFrom(data)} measure="wide" testId="matchday">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="slot-label text-live">League / Round {matchday.round}</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight sm:text-4xl">Matchday</h1>
          <p className="mt-2 text-sm text-ink-soft">Follow your lineup and the league as games are played.</p>
        </div>
        <form method="get" action={`/leagues/${id}/matchday`} className="flex items-center gap-2">
          <label htmlFor="matchday-round" className="text-xs text-ink-soft">Round</label>
          <input id="matchday-round" name="round" inputMode="numeric" defaultValue={matchday.round} className="w-16 rounded border border-rule-strong bg-stock-panel p-2 text-sm" />
          <button type="submit" className="min-h-11 rounded border border-rule-strong px-3 text-sm">Show</button>
        </form>
      </div>
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-panel-border bg-stock-panel p-4" aria-label="Matchday status">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">{matchday.final ? "Final standings" : !matchday.hasScoringBasis ? "League position pending" : hasLiveScores ? "Provisional live rank" : hasRoundScores ? "Provisional league position" : "League position before this round"}</p>
          <p className="mt-1 text-2xl font-semibold">{yourRank ? `${yourRank.rank} of ${matchday.ranks.length}` : "—"}<span className="ml-4 text-base font-normal text-ink-soft">{yourRank ? `${formatHundredths(yourRank.roundHundredths)} this round` : "No score"}</span></p>
        </div>
        <div className="text-right">
          <MatchdayLive authToken={session.token} season={season} round={matchday.round} checkedAt={matchday.snapshots.filter((row) => row.live).map((row) => row.checked_at)} final={matchday.final} hasGameWindow={hasGameWindow} gameTimes={matchday.fixtures.map((game) => game.utc_date ?? "")} hasPlayedGames={matchday.fixtures.some((game) => game.played)} />
          {!matchday.final ? <p className="mt-1 text-xs text-gold">Scores and ranks can change until finished games are recorded.</p> : <p className="mt-1 text-xs text-gain">Finished-game standings are authoritative.</p>}
        </div>
      </section>
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(16rem,1fr)]">
        <div className="flex min-w-0 flex-col gap-4">
          <Bank framed label="Your lineup" aside={`Round ${matchday.round}`}>
            {!board || board.players.length === 0 ? <EmptyNotice>Your roster and lineup appear here after the draft.</EmptyNotice> : (
              <ul role="list" className="grid gap-2 sm:grid-cols-2">
                {[...board.players].sort((a, b) => roleOrder(a.role) - roleOrder(b.role) || a.name.localeCompare(b.name)).map((player) => {
                  const fixture = matchday.fixtures.find((game) => game.local_club === player.clubCode || game.road_club === player.clubCode);
                  const snapshot = fixture ? byGame.get(fixture.game_code) : undefined;
                  const status = fixture?.played ? "Finished" : snapshot?.live ? "In play" : snapshot ? "Finished" : "Yet to play";
                  const points = matchday.scoresByPlayer[player.id];
                  const progress = points != null && player.estimateTenths && player.estimateTenths > 0 ? Math.max(0, Math.min(100, Math.round(points / player.estimateTenths * 100))) : null;
                  return <li key={player.id} className="rounded-md border border-panel-border bg-stock p-3" data-testid="matchday-player">
                    <div className="flex items-start gap-2"><PositionPatch position={player.position} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{player.name}</p><p className="text-xs text-ink-soft">{player.role ?? "Unassigned"} · {player.clubCode}</p></div><strong className="text-lg tabular-nums">{points != null ? (points / 10).toFixed(1) : "—"}</strong></div>
                    <div className="mt-3 flex justify-between gap-2 text-xs"><span className={status === "In play" ? "text-gain" : "text-ink-soft"}>{status}</span><span className="text-ink-soft">{fixture ? `${fixture.local_club} vs ${fixture.road_club}` : "No fixture"}</span></div>
                    {progress !== null ? <div className="mt-2" aria-label={`${progress}% of recent fantasy average`}><div className="h-1.5 overflow-hidden rounded-full bg-[#303a47]"><div className="h-full bg-live" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-[10px] text-ink-soft">Score vs recent average</p></div> : null}
                  </li>;
                })}
              </ul>
            )}
            <Link href={`/leagues/${id}/lineup?round=${matchday.round}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-live hover:underline">Review lineup →</Link>
          </Bank>
        </div>
        <div className="flex min-w-0 flex-col gap-4">
          <Bank framed label="Games" aside={`${matchday.fixtures.length} fixtures`}>
            {matchday.fixtures.length === 0 ? <EmptyNotice>The schedule for this round is not available yet.</EmptyNotice> : <ul role="list" className="divide-y divide-panel-border">
              {matchday.fixtures.map((fixture) => {
                const snapshot = byGame.get(fixture.game_code);
                const stale = snapshot && now - Date.parse(snapshot.checked_at) > 5 * 60_000;
                const status = fixture.played ? "Final" : snapshot?.live ? stale ? "Feed stale" : "In play" : snapshot ? "Feed unavailable" : "Scheduled";
                return <li key={fixture.id} className="py-3 first:pt-0 last:pb-0"><div className="flex justify-between gap-2 text-sm"><strong>{fixture.local_club} <span className="text-ink-soft">vs</span> {fixture.road_club}</strong><span className="tabular-nums">{snapshot ? `${snapshot.localScore}–${snapshot.roadScore}` : fixture.played ? `${fixture.local_score}–${fixture.road_score}` : "—"}</span></div><div className="mt-1 flex justify-between gap-2 text-xs text-ink-soft"><span>{gameTime(fixture.utc_date)}</span><span className={status === "In play" ? "text-gain" : stale ? "text-gold" : ""}>{status}</span></div></li>;
              })}
            </ul>}
          </Bank>
          <Bank framed label={matchday.final ? "Final table" : hasRoundScores ? "Provisional table" : "League table"}>
            {!matchday.hasScoringBasis ? <EmptyNotice>The league table appears when scores are recorded.</EmptyNotice> : <ol className="divide-y divide-panel-border">{matchday.ranks.map((row) => <li key={row.memberId} className={`flex justify-between gap-2 py-2 text-sm ${row.memberId === you.id ? "font-semibold text-live" : ""}`}><span>{row.rank}. {data.members.find((member) => member.id === row.memberId)?.teamName || data.members.find((member) => member.id === row.memberId)?.name || "Team"}</span><span className="tabular-nums">{formatHundredths(row.totalHundredths)}</span></li>)}</ol>}
          </Bank>
        </div>
      </div>
    </AppShell>
  );
}

function roleOrder(role: string | null): number {
  return ({ captain: 0, starter: 1, sixth: 2, bench: 3, inactive: 4 } as Record<string, number>)[role ?? ""] ?? 5;
}
