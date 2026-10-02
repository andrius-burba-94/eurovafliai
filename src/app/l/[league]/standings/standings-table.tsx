"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import { Bank, FilterToggle, Sparkline } from "@/components/board";
import { ScoreFigure, TeamCrest } from "@/components/broadcast";
import { BoardScroll } from "@/components/board-scroll";
import { Glyph } from "@/components/glyphs";
import { HONOURS, HonourChip } from "@/components/honour-chip";
import { Moment } from "@/components/moment";
import { completedOnly } from "@/lib/fixtures/progress";
import { badgesFrom, honoursByRound } from "@/lib/season/badges";
import { formatHundredths } from "@/lib/stats/scoring";
import {
  PHASES,
  tableFromSnapshots,
  type Phase,
  type RoundSnapshot,
} from "@/lib/stats/standings";
import type { TeamStyle } from "@/lib/teams/identity";
import type { LeaguePaths } from "@/lib/nav/urls";

const PHASE_LABEL: Record<Phase, string> = {
  RS: "Regular season",
  PI: "Play-in",
  PO: "Playoffs",
  FF: "Final Four",
};

/**
 * The table (ADR-0011): a podium for the top three, the honours the league has
 * earned so far, then every member against every counted round, with each
 * round's winner marked in gold. Members down, rounds across, a sticky name
 * column, the same scrollport the draft board uses.
 */
export function StandingsTable({
  snapshots,
  complete,
  names,
  styles,
  leagueId,
  paths,
  season,
  viewerMemberId,
}: {
  snapshots: RoundSnapshot[];
  /** Rounds with no game left; only these crown a winner or earn a badge. */
  complete: readonly number[];
  names: Record<string, string>;
  styles: Record<string, TeamStyle>;
  leagueId: string;
  paths: LeaguePaths;
  season: string;
  viewerMemberId: string | null;
}) {
  const [on, setOn] = useState<Record<Phase, boolean>>({ RS: true, PI: false, PO: false, FF: false });
  // A phase is offered once it has a counted round; the regular season always.
  const available = PHASES.filter((phase) => phase === "RS" || snapshots.some((snapshot) => snapshot.phase === phase));

  const phases = useMemo(() => {
    const selected = PHASES.filter((phase) => on[phase]);
    return selected.length > 0 ? selected : (["RS"] as const);
  }, [on]);

  const shown = useMemo(() => snapshots.filter((snapshot) => (phases as readonly Phase[]).includes(snapshot.phase)), [snapshots, phases]);
  const { rounds, rows } = tableFromSnapshots(snapshots, phases);
  const latestRound = rounds.at(-1);
  const previousOrder =
    latestRound === undefined || rounds.length < 2
      ? []
      : [...rows]
          .sort(
            (a, b) =>
              b.totalHundredths - (b.byRound[latestRound] ?? 0) - (a.totalHundredths - (a.byRound[latestRound] ?? 0)) ||
              a.memberId.localeCompare(b.memberId),
          )
          .map((row) => row.memberId);
  const finished = completedOnly(shown, { complete });
  const winners = new Map(honoursByRound(finished).map((round) => [round.round, new Set(round.winners)]));
  const badges = badgesFrom(finished);
  const latestOpen = latestRound !== undefined && !complete.includes(latestRound);
  const leader = rows[0]?.totalHundredths ?? 0;
  const nameOf = (memberId: string) => names[memberId] ?? memberId;

  // Fixed tracks after the name: every row is its own grid, so an `auto`
  // column would size to that row's content and the columns would not line up.
  const template = `minmax(var(--team-col), 1fr) 4.75rem 4.25rem repeat(${rounds.length}, 4.25rem) 4.5rem`;

  const crest = (memberId: string, size: number) =>
    styles[memberId] ? (
      <TeamCrest name={nameOf(memberId)} color={styles[memberId]!.color} shape={styles[memberId]!.crest} size={size} />
    ) : null;

  return (
    <>
      <div className="flex flex-wrap gap-1.5" data-testid="standings-phases">
        {available.map((phase) => (
          <FilterToggle
            key={phase}
            testId={`filter-phase-${phase}`}
            pressed={on[phase]}
            onPressedChange={(next) =>
              setOn((current) => {
                const changed = { ...current, [phase]: next };
                return PHASES.some((candidate) => changed[candidate]) ? changed : { ...changed, RS: true };
              })
            }
          >
            {PHASE_LABEL[phase]}
          </FilterToggle>
        ))}
      </div>

      {rows.length >= 3 ? (
        <section aria-label="The podium" data-testid="standings-podium" className="grid grid-cols-[1fr_1.15fr_1fr] items-end gap-2 border-b-2 border-rule-strong sm:gap-4">
          {[1, 0, 2].map((index) => {
            const row = rows[index]!;
            const place = index + 1;
            return (
              <div key={row.memberId} className="flex min-w-0 flex-col items-center gap-2 text-center">
                {crest(row.memberId, place === 1 ? 60 : 46)}
                <Link
                  href={`${paths.teams[row.memberId] ?? paths.base}?season=${encodeURIComponent(season)}`}
                  className="line-clamp-2 min-h-10 text-sm font-semibold hover:underline"
                >
                  {nameOf(row.memberId)}
                </Link>
                <div
                  className={`flex w-full flex-col items-center justify-center rounded-t-xl border border-b-0 ${
                    place === 1 ? "h-24 border-gold/50 bg-gold/10 sm:h-32" : place === 2 ? "h-18 border-panel-border bg-stock-panel sm:h-24" : "h-14 border-panel-border bg-stock-panel sm:h-18"
                  }`}
                >
                  <ScoreFigure size="md" className={place === 1 ? "text-gold" : ""}>
                    {place}
                  </ScoreFigure>
                  <span className="stat text-xs text-ink-soft">{formatHundredths(row.totalHundredths)}</span>
                </div>
              </div>
            );
          })}
        </section>
      ) : null}

      {badges.length > 0 ? (
        <ul role="list" aria-label="Honours so far" data-testid="standings-badges" className="flex flex-col gap-2">
          {HONOURS.filter((honour) => badges.some((badge) => badge.id === honour.id)).map((honour) => (
            <li key={honour.id} className={`flex flex-wrap items-center gap-x-3 gap-y-2 rounded-card border px-3 py-2 text-xs ${honour.tone}`}>
              <HonourChip id={honour.id} />
              <ul role="list" className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                {badges
                  .filter((badge) => badge.id === honour.id)
                  .sort((a, b) => b.tally - a.tally)
                  .map((badge) => (
                    <li key={badge.memberId}>
                      <Moment
                        kind="badge"
                        id={`badge:${leagueId}:${badge.id}:${badge.memberId}:${badge.title}`}
                        className="flex items-center gap-1.5"
                      >
                        {crest(badge.memberId, 20)}
                        <span className="text-ink">{nameOf(badge.memberId)}</span>
                        {badge.id !== "crowned" || badge.tally > 1 ? (
                          <span className="stat text-ink-soft">
                            <span aria-hidden="true">
                              {honour.id === "on-fire" ? `${badge.tally} running` : `×${badge.tally}`}
                            </span>
                            <span className="sr-only">, {badge.detail}</span>
                          </span>
                        ) : null}
                      </Moment>
                    </li>
                  ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : null}

      <Bank framed label="The table" aside={`${rounds.length} round${rounds.length === 1 ? "" : "s"}`}>
        {rows.length === 0 ? (
          <p className="text-sm text-ink-soft">No counted games in the phases you have on.</p>
        ) : (
          <>
            <p className="text-xs text-ink-soft sm:hidden">Swipe sideways to compare rounds.</p>
            <BoardScroll testId="standings-table" label="The standings table">
              <div role="table" aria-label="Points by member and round" className="min-w-full [--team-col:11.5rem] sm:[--team-col:15rem]">
                <div role="row" className="grid items-end" style={{ gridTemplateColumns: template }}>
                  <span role="columnheader" aria-label="Member" className="slot-label sticky left-0 z-10 self-stretch border-r border-b border-rule-strong bg-stock-panel px-2 pb-1.5">
                    Team
                  </span>
                  <span role="columnheader" className="slot-label border-b border-rule-strong px-2 pb-1.5 text-right">Total</span>
                  <span role="columnheader" className="slot-label border-b border-rule-strong px-2 pb-1.5 text-right">Gap</span>
                  {rounds.map((round) => (
                    <span
                      key={round}
                      role="columnheader"
                      aria-label={complete.includes(round) ? `Round ${round}` : `Round ${round}, so far`}
                      className="stat slot-label flex flex-col items-end border-b border-rule-strong px-2 pb-1.5 text-right"
                    >
                      {complete.includes(round) ? null : <span className="text-[0.625rem] text-live">So far</span>}
                      R{round}
                    </span>
                  ))}
                  <span role="columnheader" className="slot-label border-b border-rule-strong px-2 pb-1.5">Form</span>
                </div>

                {rows.map((row, index) => {
                  const was = previousOrder.indexOf(row.memberId);
                  const moved = previousOrder.length > 0 ? was - index : 0;
                  const mine = row.memberId === viewerMemberId;
                  return (
                    <Moment
                      key={row.memberId}
                      kind="overtake"
                      id={`overtake:${leagueId}:${latestRound}:${index + 1}`}
                      playing={mine && moved > 0 && !latestOpen}
                      role="row"
                      testId="standings-row"
                      className={`grid items-center border-b border-rule/60 ${mine ? "bg-live-sunk" : ""}`}
                      style={{ gridTemplateColumns: template }}
                    >
                      <span role="rowheader" className={`sticky left-0 z-10 min-w-0 self-stretch border-r border-rule-strong ${mine ? "bg-live-sunk" : "bg-stock-panel"}`}>
                        <Link
                          href={`${paths.teams[row.memberId] ?? paths.base}?season=${encodeURIComponent(season)}`}
                          data-testid="standings-team"
                          title={nameOf(row.memberId)}
                          className="flex min-h-12 min-w-0 items-center gap-2 px-2 py-1.5 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
                        >
                          <span className="stat w-5 shrink-0 text-xs text-ink-faint">{index + 1}</span>
                          {previousOrder.length > 0 ? (
                            <span
                              className={`w-6 shrink-0 text-xs font-bold ${moved > 0 ? "text-gain" : moved < 0 ? "text-loss" : "text-ink-faint"}`}
                              aria-label={moved > 0 ? `Up ${moved} places` : moved < 0 ? `Down ${-moved} places` : "No rank change"}
                            >
                              {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "·"}
                            </span>
                          ) : null}
                          {crest(row.memberId, 24)}
                          <span className="min-w-0 truncate text-sm font-semibold">{nameOf(row.memberId)}</span>
                          {mine ? <span className="shrink-0 rounded-full bg-live px-1.5 text-[0.6875rem] leading-4 font-bold text-live-ink">you</span> : null}
                        </Link>
                      </span>
                      <span role="cell" data-testid="standings-total" className="stat px-2 py-2 text-right text-sm font-bold">
                        {formatHundredths(row.totalHundredths)}
                      </span>
                      <span role="cell" className="stat px-2 py-2 text-right text-xs text-ink-faint">
                        {row.totalHundredths === leader ? "—" : `−${formatHundredths(leader - row.totalHundredths)}`}
                      </span>
                      {rounds.map((round) => {
                        const won = winners.get(round)?.has(row.memberId) ?? false;
                        return (
                          <span
                            role="cell"
                            key={round}
                            data-testid="standings-round"
                            data-round={round}
                            data-winner={won ? "true" : undefined}
                            aria-label={won ? `Round winner, ${formatHundredths(row.byRound[round] ?? 0)}` : undefined}
                            className={`stat px-2 py-2 text-right text-sm ${won ? "font-bold text-gold" : "text-ink-soft"}`}
                          >
                            {won ? (
                              <span className="inline-flex items-center gap-1">
                                <Glyph name="crown" size={11} />
                                {formatHundredths(row.byRound[round] ?? 0)}
                              </span>
                            ) : (
                              formatHundredths(row.byRound[round] ?? 0)
                            )}
                          </span>
                        );
                      })}
                      <span role="cell" className="px-2 py-2">
                        {/* The same rounds the row prints, as a shape, read from
                            the row's own values so the two cannot disagree. */}
                        <Sparkline
                          values={rounds.map((round) => row.byRound[round] ?? 0)}
                          what="points"
                          format={formatHundredths}
                          className="inline-flex h-4 w-[3.125rem] text-ink-soft"
                          testId="standings-spark"
                        />
                      </span>
                    </Moment>
                  );
                })}
              </div>
            </BoardScroll>
          </>
        )}
      </Bank>
    </>
  );
}
