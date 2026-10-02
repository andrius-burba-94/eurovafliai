import Link from "next/link";
import type { ReactNode } from "react";

import { Bank, Door, EmptyNotice, Slot, Slots } from "@/components/board";
import { PageHeader, ScoreFigure, StatusBadge, TeamCrest, teamFieldStyle } from "@/components/broadcast";
import { Glyph } from "@/components/glyphs";
import { Moment } from "@/components/moment";
import { PlayerPortrait } from "@/components/official-media";
import { RoundLadder } from "@/components/round-ladder";
import type { ProvisionalRank } from "@/lib/live/rank";
import type { PanelData } from "@/lib/panel/types";
import { dashboardStandings, seasonLabel } from "@/lib/season/dashboard";
import { movementOf, ordinal, roundStory } from "@/lib/season/story";
import {
  formatHundredths,
  formatSignedHundredths,
  formatSignedTenths,
  formatTenths,
} from "@/lib/stats/scoring";
import type { Recap, RecapBestNight } from "@/lib/stats/recap";
import type { RoundSnapshot } from "@/lib/stats/standings";
import type { TeamStyle } from "@/lib/teams/identity";
import { formatTipOff } from "@/lib/time/local";

/**
 * League Home in season (ADR-0011): your team as the scoreboard's hero, the
 * round in one line, the table and the round's story side by side, then the
 * conversation across the full width. Your own roster is not repeated here:
 * the sidebar and the standings rows already lead to every team. The page answers "how am I doing and what do I do next"
 * before anything else, at phone width, on first load.
 *
 * What it still refuses to claim: there is no head-to-head in this league, so
 * no W-L column and no "matchup"; a round is one night against the whole
 * table, and the story says so in its own facts — who won the night, by how
 * much, who took the wooden spoon.
 */
export function SeasonDashboard({
  leagueId,
  leagueName,
  season,
  snapshots,
  live,
  recap,
  playerNames,
  playerCodes,
  teamNames,
  teamStyles,
  youMemberId,
  schedule,
  activity,
}: {
  leagueId: string;
  leagueName: string;
  season: string;
  /** Finished rounds only; the round being played arrives as `live`. */
  snapshots: readonly RoundSnapshot[];
  live: LiveRound | null;
  /** The last finished round's recap. */
  recap: Recap | null;
  playerNames: Readonly<Record<string, string>>;
  playerCodes: Readonly<Record<string, string>>;
  teamNames: Readonly<Record<string, string>>;
  teamStyles: Readonly<Record<string, TeamStyle>>;
  youMemberId: string | null;
  schedule: PanelData["schedule"];
  /** Chat, trades and EuroLeague updates share this space. */
  activity: ReactNode;
}) {
  const latest = snapshots.at(-1) ?? null;
  const previous = snapshots.at(-2) ?? null;
  // While a round is played the table is Live's provisional one, so the hero
  // and the rows cannot disagree; its round column is that round so far.
  const standings = live
    ? dashboardStandings({
        totals: Object.fromEntries(live.ranks.map((row) => [row.memberId, row.totalHundredths])),
        previous: Object.fromEntries(live.ranks.map((row) => [row.memberId, row.totalHundredths - row.roundHundredths])),
        teamNames,
        youMemberId,
      })
    : dashboardStandings({
        totals: Object.fromEntries((latest?.table ?? []).map((row) => [row.memberId, row.totalHundredths])),
        previous: previous
          ? Object.fromEntries(previous.table.map((row) => [row.memberId, row.totalHundredths]))
          : null,
        teamNames,
        youMemberId,
      });
  const yourLive = live && youMemberId ? standings.find((row) => row.memberId === youMemberId) ?? null : null;
  const leaderTotal = standings[0]?.totalHundredths ?? 0;
  const movement = youMemberId ? movementOf(snapshots, youMemberId, teamNames) : null;
  // While a round is played its story is the round so far, from the same
  // provisional figures as the hero; the finished round's story waits on it.
  const story = roundStory(live ? live.recap : recap);
  const night = live ? live.bestNight : recap?.bestNight && recap.bestNight.fantasyTenths > 0
    ? {
        ...recap.bestNight,
        name: playerNames[recap.bestNight.playerId] ?? "A player",
        personCode: playerCodes[recap.bestNight.playerId] ?? "",
      }
    : null;
  const nameOf = (memberId: string) => teamNames[memberId] ?? "A team";
  const styleOf = (memberId: string) => teamStyles[memberId];
  const teamHref = (memberId: string) => `/leagues/${leagueId}/teams/${memberId}?season=${season}`;
  const teamsByName = Object.entries(teamNames).sort(([, a], [, b]) => a.localeCompare(b));
  const you = youMemberId ? { name: nameOf(youMemberId), style: styleOf(youMemberId) } : null;
  const yourNight = youMemberId ? recap?.rows.findIndex((row) => row.memberId === youMemberId) ?? -1 : -1;

  const upcoming = schedule?.games.filter((game) => game.state === "scheduled" && game.tipOff) ?? [];
  const nextTip = upcoming.map((game) => game.tipOff!).sort()[0] ?? null;
  const nextRound =
    upcoming.length > 0 && (!latest || schedule!.round > latest.round) ? schedule!.round : null;

  return (
    <>
      <PageHeader
        eyebrow={`${seasonLabel(season)} season${live ? ` · round ${live.round} in progress` : latest ? ` · after round ${latest.round}` : ""}`}
        title={leagueName}
      />

      {you ? (
        <section
          data-testid="dashboard-hero"
          aria-label="Your team"
          className="team-field relative overflow-hidden rounded-card border border-panel-border p-4 sm:p-6"
          style={you.style ? teamFieldStyle(you.style.color) : undefined}
        >
          <div aria-hidden="true" className="lattice pointer-events-none absolute inset-0" />
          <div className="relative flex flex-col gap-5">
            <div className="flex items-center gap-3">
              {you.style ? <TeamCrest name={you.name} color={you.style.color} shape={you.style.crest} size={52} /> : null}
              <div className="min-w-0 flex-1">
                <p className="slot-label">Your team</p>
                <p className="display truncate text-2xl sm:text-3xl">{you.name}</p>
              </div>
              {live ? (
                live.onAir ? (
                  <StatusBadge kind="live" testId="dashboard-live-badge">Live</StatusBadge>
                ) : (
                  <StatusBadge kind="provisional" testId="dashboard-live-badge">In progress</StatusBadge>
                )
              ) : null}
            </div>

            {live && yourLive ? (
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3" data-testid="dashboard-scorebug">
                <div>
                  <p className="slot-label">Round {live.round} so far</p>
                  <ScoreFigure size="xl" testId="dashboard-round-score">
                    {formatHundredths(yourLive.roundHundredths ?? 0)}
                  </ScoreFigure>
                </div>
                <div className="flex flex-col gap-1 pb-1">
                  <p className="slot-label">Live rank</p>
                  <ScoreFigure size="md" testId="dashboard-rank">
                    {ordinal(yourLive.position)}
                  </ScoreFigure>
                  <p className="text-sm text-ink-soft">
                    <span className="stat text-ink">{formatHundredths(yourLive.totalHundredths)}</span> total, provisional
                  </p>
                </div>
              </div>
            ) : movement ? (
              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <p className="slot-label">Rank</p>
                  <ScoreFigure size="xl" testId="dashboard-rank">
                    {ordinal(movement.rank)}
                  </ScoreFigure>
                </div>
                <div className="flex flex-col gap-1 pb-1">
                  <ScoreFigure size="md">{formatHundredths(movement.totalHundredths)}</ScoreFigure>
                  <p className="text-sm text-ink-soft">
                    {movement.moved > 0 ? (
                      <span className="font-semibold text-gain">▲ {movement.moved} </span>
                    ) : movement.moved < 0 ? (
                      <span className="font-semibold text-loss">▼ {-movement.moved} </span>
                    ) : null}
                    {movement.passed.length > 0
                      ? `passed ${movement.passed.slice(0, 2).map(nameOf).join(" and ")}${
                          movement.passed.length > 2 ? ` and ${movement.passed.length - 2} more` : ""
                        }`
                      : movement.gap > 0
                        ? `${formatHundredths(movement.gap)} behind the leader`
                        : "points, top of the table"}
                  </p>
                  {yourNight >= 0 && recap ? (
                    <p className="text-sm text-ink-soft">
                      {ordinal(yourNight + 1)} on the night in round {recap.round} ·{" "}
                      <span className="stat text-ink">{formatHundredths(recap.rows[yourNight]!.hundredths)}</span>
                    </p>
                  ) : null}
                </div>
              </div>
            ) : (
              <p className="text-sm text-ink-soft">No round has been scored yet. Your rank arrives after the first counted night.</p>
            )}

            {live ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1.5">
                  <p className="text-sm text-ink" data-testid="dashboard-games-played">
                    Round {live.round} · {live.played} of {live.total} {live.total === 1 ? "game" : "games"} played
                  </p>
                  <span aria-hidden="true" className="flex gap-1">
                    {Array.from({ length: live.total }, (_, index) => (
                      <span key={index} className={`h-1.5 w-4 rounded-full ${index < live.played ? "bg-ink" : "bg-ink/15"}`} />
                    ))}
                  </span>
                </div>
                <span className="flex items-center gap-1">
                  <Link
                    href={`/leagues/${leagueId}/lineup`}
                    data-testid="hero-lineup"
                    className="inline-flex min-h-11 items-center px-3 text-sm font-semibold text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                  >
                    Lineup
                  </Link>
                  <Link
                    href={`/leagues/${leagueId}/matchday`}
                    data-testid="hero-watch-live"
                    className="inline-flex min-h-11 items-center rounded-lg bg-live px-5 text-sm font-bold text-live-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                  >
                    Watch live
                  </Link>
                </span>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-ink-soft">
                  {nextRound && nextTip
                    ? `Round ${nextRound} tips off ${formatTipOff(nextTip)}`
                    : "Set who starts and who is captain before each round."}
                </p>
                <Link
                  href={`/leagues/${leagueId}/lineup`}
                  data-testid="hero-lineup"
                  className="inline-flex min-h-11 items-center rounded-lg bg-live px-5 text-sm font-bold text-live-ink transition hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  Set lineup
                </Link>
              </div>
            )}
          </div>
        </section>
      ) : null}

      {story ? (
        <p
          data-testid="dashboard-ticker"
          className="flex items-stretch overflow-x-auto rounded-lg border border-panel-border text-sm whitespace-nowrap"
        >
          <span className="display grid place-items-center bg-live px-3 text-base text-live-ink">
            {live ? `Round ${story.round} so far` : `Round ${story.round}`}
          </span>
          <span className="flex items-center gap-2 border-r border-panel-border px-3 py-2 text-ink-soft">
            {live ? null : <Glyph name="crown" size={14} className="text-gold" />}
            <span className="font-semibold text-ink">{nameOf(story.winner.memberId)}</span> {live ? "leading" : "won the night"}
          </span>
          {night ? (
            <span className="flex items-center gap-2 border-r border-panel-border px-3 py-2 text-ink-soft">
              <Glyph name="star" size={14} className="text-live" />
              {live ? "Best night so far" : "Best night"} <span className="font-semibold text-ink">{night.name}</span>
            </span>
          ) : null}
          {story.spoon ? (
            <span className="flex items-center gap-2 px-3 py-2 text-ink-soft">
              {live ? null : <Glyph name="spoon" size={14} className="text-wood" />}
              {live ? "Last" : "Spoon"} <span className="font-semibold text-ink">{nameOf(story.spoon.memberId)}</span>
            </span>
          ) : null}
        </p>
      ) : null}

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] lg:items-start lg:gap-x-6">
        <Bank
          label="League standings"
          aside={
            live ? (
              <span data-testid="dashboard-round">Round {live.round} so far</span>
            ) : latest ? (
              <span data-testid="dashboard-round">Round {latest.round}</span>
            ) : undefined
          }
          framed
        >
          {standings.length === 0 ? (
            <>
              <EmptyNotice testId="dashboard-standings-empty">
                No round has been scored yet. The table fills in after the first Euroleague night this league counts.
              </EmptyNotice>
              {/* Unranked and without points: nobody leads a table nothing has
                  been counted in. The rows are still the way to every team. */}
              <Slots testId="dashboard-teams">
                {teamsByName.map(([memberId, teamName]) => {
                  const style = styleOf(memberId);
                  return (
                    <Slot key={memberId} state="filled" nowrap>
                      <span className="flex w-full items-center gap-3">
                        {style ? <TeamCrest name={teamName} color={style.color} shape={style.crest} size={28} /> : null}
                        <TeamLink href={teamHref(memberId)} name={teamName} isYou={memberId === youMemberId} />
                      </span>
                    </Slot>
                  );
                })}
              </Slots>
            </>
          ) : (
            <Slots testId="dashboard-standings">
              {standings.map((row) => {
                const style = styleOf(row.memberId);
                const content = (
                  <span className="flex w-full items-center gap-3">
                    <span className="stat w-6 shrink-0 text-ink-faint">{String(row.position).padStart(2, "0")}</span>
                    {style ? <TeamCrest name={row.teamName} color={style.color} shape={style.crest} size={28} /> : null}
                    <span className="flex min-w-0 flex-1 flex-col">
                      <TeamLink href={teamHref(row.memberId)} name={row.teamName} isYou={row.isYou} />
                      <span className="text-xs text-ink-faint">
                        {row.totalHundredths === leaderTotal ? "Leader" : `−${formatHundredths(leaderTotal - row.totalHundredths)}`}
                      </span>
                    </span>
                    <span className="flex flex-col items-end">
                      <span className="stat font-semibold text-ink">{formatHundredths(row.totalHundredths)}</span>
                      <span className="stat text-xs text-ink-soft">
                        {row.roundHundredths === null ? "" : formatSignedHundredths(row.roundHundredths)}
                      </span>
                    </span>
                  </span>
                );
                return (
                  <Slot key={row.memberId} testId="dashboard-standing" state="filled" nowrap>
                    {!live && row.isYou && movement && movement.moved > 0 && latest ? (
                      <Moment kind="overtake" id={`overtake:${leagueId}:${latest.round}:${movement.rank}`} as="span" className="flex w-full">
                        {content}
                      </Moment>
                    ) : (
                      content
                    )}
                  </Slot>
                );
              })}
            </Slots>
          )}
          <Slots>
            <Door
              href={`/leagues/${leagueId}/standings?season=${season}`}
              testId="enter-standings"
              title="The full table"
              description="Every round side by side, with each round's winner."
              action="Open"
            />
          </Slots>
        </Bank>

        <Bank
          label={live ? `Round ${live.round} so far` : story ? `Round ${story.round} story` : "This round"}
          framed
        >
          {live && story ? (
            <div className="flex flex-col gap-3" data-testid="dashboard-round-so-far">
              <p className="display text-xl leading-tight sm:text-2xl" data-testid="dashboard-leading">
                {nameOf(story.winner.memberId)} lead
                {story.margin !== null && story.margin > 0 ? ` by ${formatHundredths(story.margin)}` : ""}
              </p>
              <RoundLadder
                rows={live.recap.rows}
                names={teamNames}
                styles={teamStyles}
                hrefOf={teamHref}
                marks={false}
                dense
                testId="dashboard-night"
                label={`Teams by round ${live.round} so far`}
              />
              {night ? <BestNight night={night} label="Best night so far" teamName={nameOf(night.memberId)} /> : null}
            </div>
          ) : live ? (
            <EmptyNotice testId="dashboard-news-empty">
              Round {live.round} has tipped off. The ladder fills in with the first counted points.
            </EmptyNotice>
          ) : story ? (
            <div className="flex flex-col gap-3" data-testid="dashboard-night">
              <Moment kind="sweep" id={`crown:${leagueId}:${story.round}`} testId="dashboard-winner" className="rounded-xl border border-gold/40 bg-gold/8 p-3">
                <p className="slot-label flex items-center gap-1.5 text-gold">
                  <Glyph name="crown" size={14} /> Round winner
                </p>
                <div className="mt-2 flex items-center justify-between gap-3">
                  <span className="flex min-w-0 items-center gap-3">
                    {styleOf(story.winner.memberId) ? (
                      <span className="relative">
                        <TeamCrest
                          name={nameOf(story.winner.memberId)}
                          color={styleOf(story.winner.memberId)!.color}
                          shape={styleOf(story.winner.memberId)!.crest}
                          size={44}
                        />
                        <Moment kind="crown" id={`crown-drop:${leagueId}:${story.round}`} as="span" className="absolute -top-3.5 left-2.5 text-gold">
                          <Glyph name="crown" size={22} />
                        </Moment>
                      </span>
                    ) : null}
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{nameOf(story.winner.memberId)}</span>
                      {story.margin !== null ? (
                        <span className="text-xs text-ink-soft">by {formatHundredths(story.margin)}</span>
                      ) : null}
                    </span>
                  </span>
                  <ScoreFigure size="md">{formatHundredths(story.winner.hundredths)}</ScoreFigure>
                </div>
              </Moment>

              {night ? <BestNight night={night} label="Best night" teamName={nameOf(night.memberId)} /> : null}

              {story.spoon ? (
                <div data-testid="dashboard-spoon" className="flex items-center justify-between gap-3 rounded-xl border border-panel-border p-3">
                  <span className="flex min-w-0 items-center gap-3">
                    <Moment kind="spoon" id={`spoon:${leagueId}:${story.round}`} as="span" className="grid size-10 place-items-center text-wood">
                      <Glyph name="spoon" size={30} />
                    </Moment>
                    <span className="min-w-0">
                      <span className="slot-label block">Wooden spoon</span>
                      <span className="block truncate font-semibold">{nameOf(story.spoon.memberId)}</span>
                    </span>
                  </span>
                  <span className="stat text-ink-soft">{formatHundredths(story.spoon.hundredths)}</span>
                </div>
              ) : null}

              {recap?.biggestSwing ? (
                <div data-testid="dashboard-swing" className="flex items-center justify-between gap-3 rounded-xl border border-panel-border p-3">
                  <span className="min-w-0">
                    <span className="slot-label block">Biggest swing</span>
                    <span className="block truncate text-sm">
                      {nameOf(recap.biggestSwing.memberId)}, from round {recap.biggestSwing.fromRound}
                    </span>
                  </span>
                  <span className={`stat font-semibold ${recap.biggestSwing.deltaTenths >= 0 ? "text-gain" : "text-loss"}`}>
                    {formatSignedTenths(recap.biggestSwing.deltaTenths)}
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <EmptyNotice testId="dashboard-news-empty">
              Nothing to report yet. A round&rsquo;s story arrives with the first night this league counts.
            </EmptyNotice>
          )}
          <Slots>
            {live ? (
              <Door
                href={`/leagues/${leagueId}/recap?season=${season}&round=${live.round}`}
                testId="enter-recap"
                title="The round so far"
                description="Every team's night so far, the best night and who sits last."
                action="Open"
              />
            ) : (
              <Door
                href={`/leagues/${leagueId}/recap?season=${season}`}
                testId="enter-recap"
                title="The whole round"
                description="Every team's night, the best night and the deal that moved most."
                action="Open"
              />
            )}
          </Slots>
        </Bank>
      </div>

      <div className="flex flex-col gap-4">{activity}</div>
    </>
  );
}

type Night = RecapBestNight & { readonly name: string; readonly personCode: string };

export type LiveRound = {
  readonly round: number;
  readonly played: number;
  readonly total: number;
  /** A game's live feed is running. */
  readonly onAir: boolean;
  readonly ranks: readonly ProvisionalRank[];
  /** The round so far as a night: its ladder in the same figures as `ranks`. */
  readonly recap: Recap;
  readonly bestNight: Night | null;
};

function BestNight({ night, label, teamName }: { night: Night; label: string; teamName: string }) {
  return (
    <div data-testid="dashboard-best-night" className="flex items-center justify-between gap-3 rounded-xl border border-panel-border p-3">
      <span className="flex min-w-0 items-center gap-3">
        <PlayerPortrait personCode={night.personCode} name={night.name} />
        <span className="min-w-0">
          <span className="slot-label block">{label}</span>
          <span className="block truncate font-semibold">{night.name}</span>
          <span className="text-xs text-ink-soft">for {teamName}</span>
        </span>
      </span>
      <ScoreFigure size="sm">{formatTenths(night.fantasyTenths)}</ScoreFigure>
    </div>
  );
}

function TeamLink({ href, name, isYou }: { href: string; name: string; isYou: boolean }) {
  return (
    <Link
      href={href}
      data-testid="enter-team"
      className="min-w-0 truncate text-sm font-semibold text-ink underline decoration-ink/0 underline-offset-4 transition-colors hover:decoration-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
    >
      {name}
      {isYou ? <span className="ml-2 rounded-full bg-live-sunk px-1.5 py-0.5 text-[0.6875rem] font-bold text-live">you</span> : null}
    </Link>
  );
}
