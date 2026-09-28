"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import {
  Bank,
  CardName,
  FilterToggle,
  Sparkline,
} from "@/components/board";
import { BoardScroll } from "@/components/board-scroll";
import { formatHundredths } from "@/lib/stats/scoring";
import {
  PHASES,
  tableFromSnapshots,
  type Phase,
  type RoundSnapshot,
} from "@/lib/stats/standings";

const PHASE_LABEL: Record<Phase, string> = {
  RS: "Regular season",
  PI: "Play-in",
  PO: "Playoffs",
  FF: "Final Four",
};

export function StandingsTable({
  snapshots,
  names,
  leagueId,
  season,
  viewerMemberId,
}: {
  snapshots: RoundSnapshot[];
  names: Record<string, string>;
  leagueId: string;
  season: string;
  viewerMemberId: string | null;
}) {
  const [on, setOn] = useState<Record<Phase, boolean>>({
    RS: true,
    PI: false,
    PO: false,
    FF: false,
  });

  const phases = useMemo(() => {
    const selected = PHASES.filter((phase) => on[phase]);
    return selected.length > 0 ? selected : (["RS"] as const);
  }, [on]);

  const { rounds, rows } = tableFromSnapshots(snapshots, phases);
  const latestRound = rounds.at(-1);
  const latestBest = latestRound === undefined ? null : [...rows].sort((a, b) => (b.byRound[latestRound] ?? 0) - (a.byRound[latestRound] ?? 0) || a.memberId.localeCompare(b.memberId))[0];
  const previousOrder = latestRound === undefined || rounds.length < 2 ? [] : [...rows].sort((a, b) => (b.totalHundredths - (b.byRound[latestRound] ?? 0)) - (a.totalHundredths - (a.byRound[latestRound] ?? 0)) || a.memberId.localeCompare(b.memberId)).map((row) => row.memberId);

  // The team block, the total, one track per counted round, then the trend.
  // `minmax` on the name is what makes this scroll rather than squeeze, exactly
  // as the draft board does: with room to spare a short season shares the
  // width, and a thirty-eight-round one holds its columns and overflows.
  const template = `minmax(10.5rem, 1.4fr) minmax(3.5rem, auto) repeat(${rounds.length}, minmax(3rem, auto)) minmax(4rem, auto)`;

  return (
    <>
      <div className="flex flex-wrap gap-1" data-testid="standings-phases">
        {PHASES.map((phase) => (
          <FilterToggle
            key={phase}
            testId={`filter-phase-${phase}`}
            pressed={on[phase]}
            onPressedChange={(next) =>
              setOn((current) => {
                const changed = { ...current, [phase]: next };
                return PHASES.some((candidate) => changed[candidate])
                  ? changed
                  : { ...changed, RS: true };
              })
            }
          >
            {PHASE_LABEL[phase]}
          </FilterToggle>
        ))}
      </div>

      {rows.length > 0 ? <div className="flex flex-wrap items-center gap-x-10 gap-y-3 border-y border-panel-border py-4">
        <div><p className="slot-label text-ink-soft">League leader</p><p className="mt-1 text-xl font-semibold text-ink">{names[rows[0]!.memberId] ?? rows[0]!.memberId}</p><p className="text-sm tabular-nums text-live">{formatHundredths(rows[0]!.totalHundredths)} points</p></div>
        {latestRound !== undefined && latestBest ? <div><p className="slot-label text-ink-soft">Round {latestRound} best</p><p className="mt-1 text-base font-semibold text-ink">{names[latestBest.memberId] ?? latestBest.memberId}</p><p className="text-sm tabular-nums text-gain">{formatHundredths(latestBest.byRound[latestRound] ?? 0)} points</p></div> : null}
      </div> : null}

      <Bank
        framed
        label="The table"
        aside={`${rounds.length} round${rounds.length === 1 ? "" : "s"}`}
      >
        {rows.length === 0 ? (
          <p className="text-sm text-ink-soft">
            No counted games in the phases you have on.
          </p>
        ) : (
          /* A grid, since 10.9, and the argument is the question a table
             answers. A standings table exists to compare *members in a round* —
             "who won Thursday" — and the run of `R12 14.0 R13 9.5 …` it
             replaces could not answer that at all: every member's season was a
             wrapped paragraph of its own, and by round 38 that is 38 tokens a
             row, read down rather than across.
             
             So: members down, rounds across, the same treatment the draft board
             has had since 3.1 — and the same scrollport component, which is why
             that one now takes a label. Identity and the headline number stay
             in the sticky left block, because those are the answer and the
             rounds are the evidence. */
          <>
          <p className="text-xs text-ink-soft sm:hidden">Swipe sideways to compare rounds.</p>
          <BoardScroll testId="standings-table" label="The standings table">
            <div
              role="table"
              aria-label="Points by member and round"
              className="min-w-full"
            >
              <div
                role="row"
                className="grid items-end"
                style={{ gridTemplateColumns: template }}
              >
                <span
                  role="columnheader"
                  aria-label="Member"
                  className="slot-label sticky left-0 z-10 self-stretch border-r border-b border-rule-strong bg-stock-panel px-1.5 pb-1"
                >
                  Team
                </span>
                <span
                  role="columnheader"
                  className="slot-label border-b border-rule-strong px-1.5 pb-1 text-right"
                >
                  Total
                </span>
                {rounds.map((round) => (
                  <span
                    key={round}
                    role="columnheader"
                    aria-label={`Round ${round}`}
                    className="stat slot-label border-b border-rule-strong px-1.5 pb-1 text-right"
                  >
                    {round}
                  </span>
                ))}
                <span
                  role="columnheader"
                  className="slot-label border-b border-rule-strong px-1.5 pb-1"
                >
                  Trend
                </span>
              </div>

              {rows.map((row, index) => (
                <div
                  role="row"
                  key={row.memberId}
                  data-testid="standings-row"
                  className={`grid items-baseline border-b border-rule ${row.memberId === viewerMemberId ? "bg-live-sunk/25" : ""}`}
                  style={{ gridTemplateColumns: template }}
                >
                  {/* The one cell that is a link, and a `rowheader` because it
                      is what names the row. It keeps the 44px target the whole
                      row used to carry. */}
                  <span
                    role="rowheader"
                    className="sticky left-0 z-10 min-w-0 self-stretch border-r border-rule-strong bg-stock-panel"
                  >
                    <Link
                      href={`/leagues/${leagueId}/teams/${row.memberId}?season=${encodeURIComponent(season)}`}
                      data-testid="standings-team"
                      // The whole name in `title`, because this cell truncates:
                      // a grid row is one line tall and "Gintaras Ballers FC"
                      // wrapping to two makes every other row taller for it.
                      title={names[row.memberId] ?? row.memberId}
                      className="flex min-h-11 min-w-0 items-baseline gap-x-2 px-1.5 py-2 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
                    >
                      <span className="stat slot-label shrink-0">
                        #{index + 1}
                      </span>
                      {previousOrder.length > 0 ? <span className={`shrink-0 text-xs ${previousOrder.indexOf(row.memberId) > index ? "text-gain" : previousOrder.indexOf(row.memberId) < index ? "text-loss" : "text-ink-soft"}`} aria-label={previousOrder.indexOf(row.memberId) > index ? `Up ${previousOrder.indexOf(row.memberId) - index} places` : previousOrder.indexOf(row.memberId) < index ? `Down ${index - previousOrder.indexOf(row.memberId)} places` : "No rank change"}>{previousOrder.indexOf(row.memberId) > index ? `↑${previousOrder.indexOf(row.memberId) - index}` : previousOrder.indexOf(row.memberId) < index ? `↓${index - previousOrder.indexOf(row.memberId)}` : "·"}</span> : null}
                      <span className="min-w-0 truncate">
                        <CardName scale="slot">
                          {names[row.memberId] ?? row.memberId}
                        </CardName>
                      </span>
                    </Link>
                  </span>
                  <span
                    role="cell"
                    className="stat px-1.5 py-2 text-right text-sm font-semibold"
                    data-testid="standings-total"
                  >
                    {formatHundredths(row.totalHundredths)}
                  </span>
                  {rounds.map((round) => (
                    <span
                      role="cell"
                      key={round}
                      data-testid="standings-round"
                      data-round={round}
                      className="stat px-1.5 py-2 text-right text-sm text-ink-soft"
                    >
                      {formatHundredths(row.byRound[round] ?? 0)}
                    </span>
                  ))}
                  <span role="cell" className="px-1.5 py-2">
                    {/* The same rounds the row prints, as a shape.
                        
                        Drawn from `byRound` rather than from a second query:
                        the table already has every value, and a chart reading
                        from its own source is how two numbers on one row end up
                        disagreeing. `formatHundredths` is passed for the spoken
                        sentence, so a screen reader hears the same 12.0 the row
                        prints rather than the 1200 that is stored. */}
                    <Sparkline
                      values={rounds.map((round) => row.byRound[round] ?? 0)}
                      what="points"
                      format={formatHundredths}
                      className="inline-flex h-4 w-[3.125rem] text-ink-soft"
                      testId="standings-spark"
                    />
                  </span>
                </div>
              ))}
            </div>
          </BoardScroll>
          </>
        )}
      </Bank>
    </>
  );
}
