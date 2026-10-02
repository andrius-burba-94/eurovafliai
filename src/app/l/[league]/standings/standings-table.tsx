"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";

import { Bank, FilterToggle, Sparkline } from "@/components/board";
import { TeamCrest } from "@/components/broadcast";
import { BoardScroll } from "@/components/board-scroll";
import { Glyph, type GlyphName } from "@/components/glyphs";
import { HONOURS } from "@/components/honour-chip";
import { InfoTip } from "@/components/info-tip";
import { Moment } from "@/components/moment";
import { completedOnly } from "@/lib/fixtures/progress";
import type { LeaguePaths } from "@/lib/nav/urls";
import { badgesFrom, honoursByRound, type Badge } from "@/lib/season/badges";
import { nightPlace, placeTint } from "@/lib/season/tint";
import { formatHundredths } from "@/lib/stats/scoring";
import {
  PHASES,
  tableFromSnapshots,
  type Phase,
  type RoundSnapshot,
} from "@/lib/stats/standings";
import type { TeamStyle } from "@/lib/teams/identity";

const PHASE_LABEL: Record<Phase, string> = {
  RS: "Regular season",
  PI: "Play-in",
  PO: "Playoffs",
  FF: "Final Four",
};

/** First, second and third carry a medal in the rank column; colour always beside the number. */
const MEDAL = ["bg-gold/20 text-gold", "bg-ink/10 text-ink", "bg-wood/25 text-wood"] as const;

/**
 * The table (ADR-0011, redrawn in S30): one board that answers the page at a
 * glance. Each row is a team's rank (the top three in medal colours), its
 * movement since the last round, its honours as marks beside the name, a race
 * bar of its total against the leader's, the gap, every round shaded by where
 * it finished that night (the waffle board's colours), and its form. The
 * podium and the honours list it replaces said the same things in three
 * times the height.
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
  aside,
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
  /** Beside the table's heading: the provisional note when a round counted everyone at 100%. */
  aside?: ReactNode;
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
  const trailing = rows.at(-1)?.totalHundredths ?? 0;
  // The race is the gap, so the bar starts a little below last place rather
  // than at zero, where every total in a tight table looks the same length.
  const floor = Math.max(0, trailing - Math.max(1, leader - trailing) * 0.35);
  const raceShare = (total: number) => (leader > floor ? Math.max(4, ((total - floor) / (leader - floor)) * 100) : 100);
  const nameOf = (memberId: string) => names[memberId] ?? memberId;
  const pointsIn = (round: number) => rows.map((row) => row.byRound[round] ?? 0);

  // Fixed tracks after the name: every row is its own grid, so an `auto`
  // column would size to that row's content and the columns would not line up.
  const template = `minmax(var(--team-col), 1fr) var(--race-col) 4rem 3.5rem repeat(${rounds.length}, 3.75rem) 4.25rem`;

  const crest = (memberId: string, size: number) =>
    styles[memberId] ? (
      <TeamCrest name={nameOf(memberId)} color={styles[memberId]!.color} shape={styles[memberId]!.crest} size={size} />
    ) : null;
  const teamHref = (memberId: string) => `${paths.teams[memberId] ?? paths.base}?season=${encodeURIComponent(season)}`;

  return (
    <>
      {available.length > 1 ? (
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
      ) : null}

      <Bank
        framed
        label="The table"
        info={
          latestOpen
            ? `Round ${latestRound} is still being played, so its column is points so far and nobody has won it yet. Each finished round is shaded by where a team finished that night, gold for first and red for last.`
            : "Each round is shaded by where a team finished that night, gold for first and red for last. The bar is each total against the leader's."
        }
        aside={aside}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-ink-soft">No counted games in the phases you have on.</p>
        ) : (
          <>
            <p className="text-xs text-ink-soft sm:hidden">Swipe sideways to compare rounds.</p>
            <BoardScroll testId="standings-table" label="The standings table">
              <div
                role="table"
                aria-label="Points by member and round"
                className="min-w-full [--race-col:0rem] [--team-col:12.5rem] sm:[--team-col:15rem] lg:[--race-col:9rem]"
              >
                <div role="row" className="grid items-end" style={{ gridTemplateColumns: template }}>
                  <span role="columnheader" aria-label="Member" className="slot-label sticky left-0 z-10 self-stretch border-r border-b border-rule-strong bg-stock-panel px-2 pb-1.5">
                    Team
                  </span>
                  {/* Kept in the grid at every width (a zero-width track below
                      `lg`): a hidden cell would drop out of the grid and slide
                      every later column one track left. */}
                  <span role="columnheader" aria-label="Race to the leader" className="slot-label self-stretch overflow-hidden border-b border-rule-strong pb-1.5 lg:px-2">
                    <span className="hidden lg:inline">Race</span>
                  </span>
                  <span role="columnheader" className="slot-label border-b border-rule-strong px-2 pb-1.5 text-right">Total</span>
                  <span role="columnheader" className="slot-label border-b border-rule-strong px-2 pb-1.5 text-right">Gap</span>
                  {rounds.map((round) => (
                    <span
                      key={round}
                      role="columnheader"
                      aria-label={complete.includes(round) ? `Round ${round}` : `Round ${round}, so far`}
                      className="stat slot-label flex flex-col items-center border-b border-rule-strong px-1 pb-1.5 text-center"
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
                  const marks = badges.filter((badge) => badge.memberId === row.memberId);
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
                      <span role="rowheader" className={`sticky left-0 z-10 flex min-w-0 items-center self-stretch border-r border-rule-strong ${mine ? "bg-live-sunk" : "bg-stock-panel"}`}>
                        <span
                          className={`stat ml-1.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${MEDAL[index] ?? "text-ink-faint"}`}
                        >
                          {index + 1}
                        </span>
                        {previousOrder.length > 0 ? (
                          <span
                            className={`stat w-7 shrink-0 text-center text-[0.6875rem] font-bold ${moved > 0 ? "text-gain" : moved < 0 ? "text-loss" : "text-ink-faint"}`}
                            aria-label={moved > 0 ? `Up ${moved} places` : moved < 0 ? `Down ${-moved} places` : "No rank change"}
                          >
                            {moved > 0 ? `▲${moved}` : moved < 0 ? `▼${-moved}` : "·"}
                          </span>
                        ) : null}
                        <Link
                          href={teamHref(row.memberId)}
                          data-testid="standings-team"
                          title={nameOf(row.memberId)}
                          className="flex min-h-11 min-w-0 flex-1 items-center gap-2 py-1 pr-1 transition-colors hover:underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
                        >
                          {crest(row.memberId, 22)}
                          <span className="min-w-0 truncate text-sm font-semibold">{nameOf(row.memberId)}</span>
                          {mine ? <span className="shrink-0 rounded-full bg-live px-1.5 text-[0.6875rem] leading-4 font-bold text-live-ink">you</span> : null}
                        </Link>
                        {marks.length > 0 ? (
                          <span className="flex shrink-0 items-center gap-0.5 pr-1.5" data-testid="standings-marks">
                            {marks.map((badge) => (
                              <HonourMark key={badge.id} badge={badge} leagueId={leagueId} />
                            ))}
                          </span>
                        ) : null}
                      </span>
                      <span role="cell" className="overflow-hidden lg:px-2" aria-hidden="true">
                        <span className="hidden h-1.5 overflow-hidden rounded-full bg-stock-high lg:block">
                          <span
                            className="block h-full rounded-full"
                            style={{
                              width: `${raceShare(row.totalHundredths)}%`,
                              background: styles[row.memberId] ? `var(--color-team-${styles[row.memberId]!.color})` : "var(--color-ink-soft)",
                            }}
                          />
                        </span>
                      </span>
                      <span role="cell" data-testid="standings-total" className="stat px-2 py-1.5 text-right text-sm font-bold">
                        {formatHundredths(row.totalHundredths)}
                      </span>
                      <span role="cell" className="stat px-2 py-1.5 text-right text-xs text-ink-faint">
                        {row.totalHundredths === leader ? "—" : `−${formatHundredths(leader - row.totalHundredths)}`}
                      </span>
                      {rounds.map((round) => {
                        const points = row.byRound[round] ?? 0;
                        const finishedRound = complete.includes(round);
                        const place = nightPlace(points, pointsIn(round));
                        const won = winners.get(round)?.has(row.memberId) ?? false;
                        return (
                          <span role="cell" key={round} className="px-0.5 py-1">
                            <span
                              data-testid="standings-round"
                              data-round={round}
                              data-winner={won ? "true" : undefined}
                              aria-label={
                                finishedRound
                                  ? `${won ? "Round winner" : `${place} of ${rows.length}`}, ${formatHundredths(points)}`
                                  : `So far, ${formatHundredths(points)}`
                              }
                              className={`stat flex h-8 items-center justify-center gap-0.5 rounded-block text-xs ${
                                won ? "font-bold" : finishedRound ? "text-ink" : "border border-dashed border-rule text-ink-soft"
                              }`}
                              style={finishedRound ? { background: placeTint(place, rows.length) } : undefined}
                            >
                              {won ? <Glyph name="crown" size={10} className="text-gold" /> : null}
                              {formatHundredths(points)}
                            </span>
                          </span>
                        );
                      })}
                      <span role="cell" className="px-2 py-1.5">
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

const GLYPH: Readonly<Record<Badge["id"], GlyphName>> = { "on-fire": "flame", crowned: "crown", "spoon-collector": "spoon" };

/** An honour as a mark beside the team: its glyph and count, what it means behind it. */
function HonourMark({ badge, leagueId }: { badge: Badge; leagueId: string }) {
  const honour = HONOURS.find((row) => row.id === badge.id)!;
  return (
    <Moment kind="badge" id={`badge:${leagueId}:${badge.id}:${badge.memberId}:${badge.title}`} as="span" className="inline-flex">
      <InfoTip
        testId={`honour-chip-${badge.id}`}
        triggerClassName={`inline-flex min-h-8 items-center gap-0.5 rounded-full px-1 text-[0.6875rem] font-bold ${honour.ink}`}
        trigger={
          <>
            <Glyph name={GLYPH[badge.id]} size={13} />
            {badge.tally > 1 ? <span className="stat">{badge.tally}</span> : null}
            <span className="sr-only">{badge.title}</span>
          </>
        }
      >
        <span className="font-semibold">{honour.label}</span> · {badge.detail}
      </InfoTip>
    </Moment>
  );
}
