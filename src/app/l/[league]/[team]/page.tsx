import { displayName } from "@/lib/players/name";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { Bank, EmptyNotice, FixtureNote, PositionPatch, Sparkline } from "@/components/board";
import { AppShell } from "@/components/app-shell";
import { ClubBar } from "@/components/club-bar";
import { ScoreFigure, StatusBadge, TeamCrest, availabilityBadge, teamFieldStyle } from "@/components/broadcast";
import { Glyph } from "@/components/glyphs";
import { InfoTip } from "@/components/info-tip";
import { TeamIdentityPicker } from "@/components/team-identity-picker";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { PlayerStatsLink } from "@/components/player-stats-link";
import { ContextPanel } from "@/components/context-panel";
import { resolveSeason, SeasonControl } from "@/components/season-control";
import { getSession } from "@/lib/auth/session";
import { clubShares } from "@/lib/clubs/share";
import { serverConfig } from "@/lib/config/server";
import { radarSize } from "@/lib/engine";
import { readRoundProgress } from "@/lib/fixtures/queries";
import { readMatchdayData } from "@/lib/live/queries";
import { formatHundredths, formatSignedTenths, formatTenths } from "@/lib/stats/scoring";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";
import { readPanel } from "@/lib/panel/queries";
import { readMemberDeals, readMemberRoster } from "@/lib/memberships/queries";
import { liveRound } from "@/lib/season/dashboard";
import { movementOf, ordinal } from "@/lib/season/story";
import { placeTint } from "@/lib/season/tint";
import { readLeagueStats } from "@/lib/stats/league-stats-queries";
import { teamSummary } from "@/lib/stats/team-summary";

import { ImpactList } from "./impact-list";
import { leagueHref, playerHref, teamHref } from "@/lib/nav/urls";

/**
 * A team's own page (S31): the team first, then its squad. The hero is the
 * team in its colours with its rank, total and gap, the round being played
 * when there is one, and its finish in every round. Under it, one line of
 * what kind of team this is (best and worst night, crowns, lineup IQ,
 * captain calls, the market). The roster is a dense board beside who is
 * carrying it, the clubs its points come from and its deals.
 *
 * The squad of record is active `roster_memberships`; deals are live deltas
 * from box scores; the season figures are League Stats' own, over finished
 * rounds only.
 */
export default async function TeamPage({
  params,
  searchParams,
}: PageProps<"/l/[league]/[team]">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { league: leagueRef, team: teamRef } = await params;
  const query = await searchParams;
  const currentSeason = serverConfig().EUROLEAGUE_SEASON;
  const season = resolveSeason(query.season, currentSeason);

  const data = await getLeagueWithMembers(leagueRef);
  if (!data) notFound();
  const id = data.league.id;
  const base = leagueHref(data.league);

  const viewerIsMember = data.members.some((member) => member.isYou);
  if (!viewerIsMember) notFound();

  const member = data.members.find((row) => row.slug === teamRef || row.id === teamRef);
  if (!member) notFound();
  const memberId = member.id;
  if ((data.league.slug && leagueRef !== data.league.slug) || (member.slug && teamRef !== member.slug)) {
    redirect(`${teamHref(data.league, member)}${typeof query.season === "string" ? `?season=${encodeURIComponent(query.season)}` : ""}`);
  }

  const teamNames = Object.fromEntries(
    data.members.map((row) => [
      row.id,
      row.teamName.trim() ? row.teamName : row.name,
    ]),
  );
  const [roster, deals, panel, statsPage] = await Promise.all([
    readMemberRoster(id, memberId, season),
    readMemberDeals(id, memberId, season, teamNames),
    readPanel({ leagueId: id, season, teamNames }),
    readLeagueStats(id, season).catch(() => null),
  ]);
  const finishedSnapshots = statsPage?.snapshots ?? [];
  const progress =
    season === currentSeason && data.league.status === "season"
      ? await readRoundProgress(season, session.token, finishedSnapshots.map((snap) => snap.round)).catch(() => null)
      : null;
  const live = progress ? liveRound(progress) : null;
  const matchday = live
    ? await readMatchdayData({
        leagueId: id,
        memberIds: data.members.map((row) => row.id),
        season,
        requestedRound: live.round,
        token: session.token,
      }).catch(() => null)
    : null;
  const liveRow = matchday?.ranks.find((row) => row.memberId === memberId) ?? null;

  const template = data.settings.roster_template;
  const teamTitle = member.teamName.trim() ? member.teamName : member.name;
  const played = roster.filter((player) => player.games > 0);
  const top = [...played].sort((a, b) => b.seasonTenths - a.seasonTenths)[0];
  const low = [...played].sort((a, b) => a.seasonTenths / a.games - b.seasonTenths / b.games)[0];
  const rosterSize = radarSize(template);
  const viewerCanManage =
    data.isCommissioner ||
    data.members.some((row) => row.isYou && row.canManage);
  const movement = movementOf(finishedSnapshots, memberId, teamNames);
  const summary = statsPage ? teamSummary(statsPage.stats, memberId) : null;
  const dealsNet = deals.reduce((sum, deal) => sum + deal.deltaTenths, 0);
  const memberSlug = member.slug || memberId;

  return (
    <AppShell
      current={member.isYou ? "team" : undefined}
      league={navLeagueFrom(data)}
      testId="roster"
      measure="wide"
      panel={<ContextPanel data={panel} />}
    >
      <section
        aria-label="The team"
        data-testid="team-hero"
        className="team-field relative overflow-hidden rounded-card border border-panel-border p-4 sm:p-6"
        style={teamFieldStyle(member.color)}
      >
        <div aria-hidden="true" className="lattice pointer-events-none absolute inset-0" />
        <div className="relative flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-4">
              <TeamCrest name={teamTitle} color={member.color} shape={member.crest} size={64} />
              <div className="min-w-0">
                <p className="slot-label">{data.league.name} · {member.isYou ? "My team" : "Team"}</p>
                <h1 className="display mt-1 min-w-0 text-4xl break-words sm:text-5xl">{teamTitle}</h1>
                <p className="mt-1 text-sm text-ink-soft">{member.name} · {roster.length} of {rosterSize} players</p>
              </div>
            </div>
            {member.isYou && data.league.status === "season" ? (
              <Link href={`${base}/lineup`} className="inline-flex min-h-11 items-center rounded-lg bg-live px-4 text-sm font-bold text-live-ink hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">
                Set lineup
              </Link>
            ) : null}
          </div>

          {movement || liveRow ? (
            <div className="flex flex-wrap items-end gap-x-6 gap-y-4 sm:gap-x-10" data-testid="team-figures">
              {movement ? (
                <div>
                  <p className="slot-label">Rank</p>
                  <span className="flex items-end gap-2">
                    <ScoreFigure size="xl" testId="team-rank">{ordinal(movement.rank)}</ScoreFigure>
                    {movement.moved !== 0 ? (
                      <span className={`stat pb-2 text-sm font-bold ${movement.moved > 0 ? "text-gain" : "text-loss"}`}>
                        {movement.moved > 0 ? `▲${movement.moved}` : `▼${-movement.moved}`}
                      </span>
                    ) : null}
                  </span>
                </div>
              ) : null}
              {movement ? (
                <div className="flex flex-col gap-1 pb-1">
                  <p className="slot-label">Total</p>
                  <ScoreFigure size="md">{formatHundredths(movement.totalHundredths)}</ScoreFigure>
                  <p className="text-sm text-ink-soft">
                    {movement.gap > 0 ? `${formatHundredths(movement.gap)} behind the leader` : "Top of the table"}
                  </p>
                </div>
              ) : null}
              {live && liveRow ? (
                <div className="flex flex-col gap-1 pb-1" data-testid="team-round-so-far">
                  <p className="slot-label flex items-center gap-2">
                    Round {live.round} so far
                    <StatusBadge kind="provisional">{live.played} of {live.total}</StatusBadge>
                  </p>
                  <ScoreFigure size="md">{formatHundredths(liveRow.roundHundredths)}</ScoreFigure>
                  <p className="text-sm text-ink-soft">{ordinal(liveRow.rank)} on the live table</p>
                </div>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-ink-soft">No round has been scored yet. The rank arrives after the first counted night.</p>
          )}

          {summary && summary.finishes.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              <p className="slot-label flex items-center gap-1.5">
                Every round
                <InfoTip label="About every round">Where the team finished each finished round: gold for first, red for last.</InfoTip>
              </p>
              <ol className="flex flex-wrap gap-1" data-testid="team-finishes">
                {summary.finishes.map((finish) => (
                  <li
                    key={finish.round}
                    aria-label={finish.place === null ? `Round ${finish.round}: no score` : `Round ${finish.round}: ${ordinal(finish.place)}`}
                    title={`Round ${finish.round}`}
                    className={`stat grid size-8 place-items-center rounded-block text-xs ${finish.place === 1 ? "font-bold" : ""}`}
                    style={finish.place === null ? undefined : { background: placeTint(finish.place, summary.teams) }}
                  >
                    {finish.place ?? "–"}
                  </li>
                ))}
                {live ? (
                  <li aria-label={`Round ${live.round}: in progress`} className="stat grid size-8 place-items-center rounded-block border border-dashed border-rule text-xs text-ink-soft">
                    {liveRow ? liveRow.rank : "·"}
                  </li>
                ) : null}
              </ol>
            </div>
          ) : null}
        </div>
      </section>

      {summary?.profile ? (
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-panel-border bg-panel-border sm:grid-cols-4 2xl:grid-cols-8" data-testid="team-strip">
          <Figure label="Best round" value={formatHundredths(summary.profile.bestHundredths)} />
          <Figure label="Worst round" value={formatHundredths(summary.profile.worstHundredths)} />
          <Figure
            label="Won"
            value={
              <span className={`inline-flex items-center gap-1 ${summary.profile.roundsWon > 0 ? "text-gold" : ""}`}>
                {summary.profile.roundsWon > 0 ? <Glyph name="crown" size={14} /> : null}
                {summary.profile.roundsWon}
              </span>
            }
            tip="Rounds finished first."
          />
          <Figure label="Top 3" value={String(summary.profile.topThree)} tip="Rounds finished in the top three." />
          <Figure
            label="Lineup IQ"
            value={summary.hindsight?.iqPercent != null ? `${summary.hindsight.iqPercent}%` : "—"}
            tip="Points scored as a share of the best lineup the same squad allowed, in rounds with a recorded lineup."
          />
          <Figure
            label="Captain"
            value={summary.lineup && summary.lineup.captainRounds > 0 ? `${summary.lineup.captainHits}/${summary.lineup.captainRounds}` : "—"}
            tip="Rounds the captain was the best of the starting five."
          />
          <Figure
            label="Bench"
            value={summary.lineup ? formatTenths(summary.lineup.benchLostTenths) : "—"}
            tip="Points scored by bench and inactive players that did not count in full."
          />
          <Figure
            label="Deals"
            value={
              deals.length === 0 ? (
                "—"
              ) : (
                <span className={dealsNet > 0 ? "text-gain" : dealsNet < 0 ? "text-loss" : ""}>{formatSignedTenths(dealsNet)}</span>
              )
            }
            tip="Net points since this team's trades, signings and drops, counted the way its lineups counted them."
          />
        </dl>
      ) : null}

      <SeasonControl
        action={teamHref(data.league, member)}
        season={season}
        currentSeason={currentSeason}
      />

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)] lg:items-start">
        <Bank
          framed
          label="The roster"
          aside={`${roster.length} of ${rosterSize}`}
          info="Form is the last five games' PIR. Last is the player's latest game on this roster and Season every game on it, both in fantasy points."
        >
          {roster.length === 0 ? (
            <EmptyNotice testId="roster-empty">
              No players are on this roster yet. Slots fill from the draft, then from recorded trades.
            </EmptyNotice>
          ) : (
            <ul role="list" aria-label={`${teamTitle} roster`} data-testid="roster-list" className="flex flex-col">
              {(["G", "F", "C"] as const).map((position) => {
                const group = roster.filter((player) => player.position === position).sort((a, b) => b.seasonTenths - a.seasonTenths);
                return (
                  <li key={position} className="flex flex-col">
                    <p className="slot-label flex items-center gap-2 border-b border-rule-strong pt-3 pb-1.5 first:pt-0">
                      <PositionPatch position={position} />
                      {position === "G" ? "Guards" : position === "F" ? "Forwards" : "Centers"} · {group.length}/{template[position]}
                      <span className="ml-auto hidden gap-0 text-right sm:grid sm:w-[13.5rem] sm:grid-cols-[3.25rem_3rem_3.5rem_3.75rem]" aria-hidden="true">
                        <span>Form</span>
                        <span>Last</span>
                        <span>Season</span>
                        <span>Pick</span>
                      </span>
                    </p>
                    <ul role="list" className="flex flex-col">
                      {group.map((player) => {
                        const badge = availabilityBadge(player.status);
                        return (
                          <li key={player.id} data-testid="roster-player" className="flex min-h-11 items-center gap-2 border-b border-panel-border last:border-b-0">
                            <PlayerStatsLink
                              id={player.id}
                              name={player.name}
                              href={`${playerHref(player, data.league)}?member=${encodeURIComponent(memberSlug)}`}
                              className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-md px-1 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                            >
                              <ClubCrest clubCode={player.clubCode} />
                              <span className="flex min-w-0 flex-1 flex-col">
                                <span className="flex min-w-0 items-center gap-2">
                                  <span className="truncate text-sm font-semibold">{displayName(player.name)}</span>
                                  {badge ? <StatusBadge kind={badge.kind}>{badge.word}</StatusBadge> : null}
                                </span>
                                <span className="flex min-w-0 items-center gap-1.5 text-xs text-ink-soft [&_*]:text-xs">
                                  <span className="stat">{player.clubCode}</span>
                                  <FixtureNote fixture={player.fixture} />
                                </span>
                              </span>
                            </PlayerStatsLink>
                            <span className="grid w-[8.5rem] shrink-0 grid-cols-[3rem_3.5rem] items-center text-right sm:w-[13.5rem] sm:grid-cols-[3.25rem_3rem_3.5rem_3.75rem]">
                              <span className="hidden h-4 w-[3rem] items-center justify-end text-ink-soft sm:inline-flex" data-testid="roster-form">
                                {player.last5Pirs.length >= 2 ? (
                                  <Sparkline values={player.last5Pirs} what="PIR" className="inline-flex h-4 w-[3rem]" testId="roster-spark" />
                                ) : (
                                  <span className="stat text-xs text-ink-faint" aria-label="No form yet">—</span>
                                )}
                              </span>
                              <span className="stat text-xs text-ink-soft" title={player.lastRound === null ? undefined : `Round ${player.lastRound}`} data-testid="roster-last">
                                {player.lastTenths === null ? "—" : formatTenths(player.lastTenths)}
                              </span>
                              <span className="stat text-sm font-bold">{formatTenths(player.seasonTenths)}</span>
                              <span className="stat hidden text-xs text-ink-faint sm:block">{player.overallNo ? `#${player.overallNo}` : "—"}</span>
                            </span>
                          </li>
                        );
                      })}
                      {Array.from({ length: Math.max(0, template[position] - group.length) }, (_, index) => (
                        <li key={`open-${index}`} className="flex min-h-11 items-center border-b border-dashed border-rule text-sm text-ink-faint last:border-b-0">
                          Open roster slot
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </Bank>

        <div className="flex flex-col gap-6">
          {roster.length > 1 && top && low && top.id !== low.id ? (
            <Bank framed label="Who carries it" info="Most season points, and the fewest points a game among those who have played.">
              <ul role="list" className="flex flex-col divide-y divide-panel-border" data-testid="roster-callouts">
                <CallOut tone="gain" label="Carrying you" name={displayName(top.name)} personCode={top.personCode} value={formatTenths(top.seasonTenths)} />
                <CallOut tone="loss" label="On thin ice" name={displayName(low.name)} personCode={low.personCode} value={formatTenths(low.seasonTenths)} />
              </ul>
            </Bank>
          ) : null}

          {summary?.clubs && summary.clubs.clubs.length > 0 ? (
            <Bank framed label="Points by club" info="Counted points by the EuroLeague club the player wore that night.">
              <TeamClubs clubs={summary.clubs} clubNames={statsPage?.clubNames ?? new Map()} />
            </Bank>
          ) : null}

          <ImpactList
            deals={deals}
            teamName={teamTitle}
            base={base}
            canManage={viewerCanManage}
            season={data.league.status === "season"}
          />

          {member.isYou || viewerCanManage ? (
            <details className="group rounded-xl border border-panel-border bg-stock-panel px-4 py-3" data-testid="edit-crest">
              <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
                {member.isYou ? "Your crest" : `${teamTitle}'s crest`}
                <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-90">&rsaquo;</span>
              </summary>
              <div className="pt-3 pb-1">
                <TeamIdentityPicker leagueId={id} memberId={member.id} name={teamTitle} color={member.color} crest={member.crest} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    </AppShell>
  );
}

/** One figure in the team's strip: its word, its number, and what it means behind an "i". */
function Figure({ label, value, tip }: { label: string; value: ReactNode; tip?: string }) {
  return (
    <div className="flex flex-col gap-1 bg-stock-panel px-4 py-3">
      <dt className="slot-label flex items-center gap-1.5">
        {label}
        {tip ? <InfoTip label={`About ${label}`}>{tip}</InfoTip> : null}
      </dt>
      <dd className="stat text-lg font-bold">{value}</dd>
    </div>
  );
}

function CallOut({ tone, label, name, personCode, value }: { tone: "gain" | "loss"; label: string; name: string; personCode?: string; value: string }) {
  return (
    <li className="flex items-center justify-between gap-3 py-2">
      <span className="flex min-w-0 items-center gap-3">
        <PlayerPortrait personCode={personCode} name={name} />
        <span className="min-w-0">
          <span className={`slot-label block ${tone === "gain" ? "text-gain" : "text-loss"}`}>{label}</span>
          <span className="block truncate text-sm font-semibold">{name}</span>
        </span>
      </span>
      <ScoreFigure size="sm">{value}</ScoreFigure>
    </li>
  );
}

/** The team's points cut by club, each in its own colour, crest beside the number. */
function TeamClubs({
  clubs,
  clubNames,
}: {
  clubs: { readonly totalTenths: number; readonly clubs: readonly { readonly clubCode: string; readonly tenths: number }[] };
  clubNames: ReadonlyMap<string, string>;
}) {
  const top = clubs.clubs.slice(0, 5);
  const segments = clubShares(clubs.clubs, 5).map((share) => ({ ...share, name: clubNames.get(share.clubCode) ?? share.clubCode }));
  return (
    <div className="flex flex-col gap-3" data-testid="team-clubs">
      <ClubBar segments={segments} testId="team-club-bar" />
      <ol className="flex flex-col gap-1.5">
        {top.map((club) => (
          <li key={club.clubCode} className="flex items-center gap-2 text-sm">
            <ClubCrest clubCode={club.clubCode} />
            <span className="min-w-0 flex-1 truncate text-ink-soft">{clubNames.get(club.clubCode) ?? club.clubCode}</span>
            <span className="stat font-semibold">{formatTenths(club.tenths)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
