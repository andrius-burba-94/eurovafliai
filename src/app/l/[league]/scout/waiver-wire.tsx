"use client";

import { useState } from "react";

import { Bank, CardName, EmptyNotice, FilterToggle, PositionPatch, Slot, Slots } from "@/components/board";
import { availabilityBadge, StatusBadge } from "@/components/broadcast";
import { PlayerStatsLink } from "@/components/player-stats-link";
import type { Confidence, Run } from "@/lib/advisor/outlook";
import { formatOutlook, type WireRow } from "@/lib/advisor/wire";
import type { Position } from "@/lib/engine";
import { displayName } from "@/lib/players/name";

const SHOWN = 30;
const MORE = 20;

const RUN_WORD: Record<Run, string> = { easy: "Easy run", even: "Even run", hard: "Hard run" };
export const CONFIDENCE_WORD: Record<Confidence, string> = { high: "High", medium: "Medium", low: "Low" };

const points = formatOutlook;

export function roleNote(row: WireRow): string | null {
  const outlook = row.outlook;
  if (!outlook) return "no games yet";
  if (outlook.baseSource === "last") return "last season's line";
  const n = outlook.gamesInRole;
  if (n === 0) return null;
  if (outlook.role === "starter") return n === 1 ? "started his last game" : `started his last ${n}`;
  return n === 1 ? "off the bench last game" : `off the bench in his last ${n}`;
}

export function RunWord({ run }: { run: Run }) {
  const tone = run === "easy" ? "text-gain" : run === "hard" ? "text-loss" : "text-ink-soft";
  return <span className={`text-sm font-semibold ${tone}`}>{RUN_WORD[run]}</span>;
}

export function TripletHead() {
  return (
    <span className="grid grid-cols-3 gap-x-2 text-right sm:gap-x-3" aria-hidden="true">
      <span className="slot-label whitespace-nowrap">
        <span className="hidden sm:inline">Next </span>5
      </span>
      <span className="slot-label">10</span>
      <span className="slot-label">15</span>
    </span>
  );
}

export function Triplet({ next, emphasise = true }: { next: readonly (number | null)[]; emphasise?: boolean }) {
  return (
    <span className="grid grid-cols-3 gap-x-2 text-right sm:gap-x-3">
      {next.map((value, index) => (
        <span
          key={index}
          aria-label={`${["Next 5", "Next 10", "Next 15"][index]}: ${value === null ? "no games" : points(value)}`}
          className={`stat ${index === 0 && emphasise ? "text-base font-semibold text-ink" : "text-sm text-ink-soft"}`}
        >
          {value === null ? "—" : points(value)}
        </span>
      ))}
    </span>
  );
}

export function PlayerCell({ row, verb }: { row: WireRow; verb?: "Drop" | "Add" }) {
  const badge = availabilityBadge(row.status);
  const note = roleNote(row);
  return (
    <span className="flex min-w-0 items-center gap-2.5">
      <PositionPatch position={row.position} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          {verb ? <span className={`slot-label ${verb === "Add" ? "text-gain" : "text-loss"}`}>{verb}</span> : null}
          <PlayerStatsLink id={row.id} name={row.name} className={`min-w-0 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${verb === "Drop" ? "text-ink-soft" : ""}`}>
            <CardName scale="slot">{displayName(row.name)}</CardName>
          </PlayerStatsLink>
        </span>
        <span className="flex flex-wrap items-center gap-x-1.5 text-sm text-ink-soft">
          {row.clubCode}
          {note ? ` · ${note}` : ""}
          {badge ? <StatusBadge kind={badge.kind}>{badge.word}</StatusBadge> : null}
        </span>
      </span>
    </span>
  );
}

export function WaiverWire({ rows, rated, unit }: { rows: readonly WireRow[]; rated: number; unit: string }) {
  const [position, setPosition] = useState<Position | null>(null);
  const [limit, setLimit] = useState(SHOWN);
  const filtered = rows.filter((row) => position === null || row.position === position);
  const shown = filtered.slice(0, limit);
  const pick = (next: Position | null) => {
    setPosition(next);
    setLimit(SHOWN);
  };

  return (
    <Bank
      label="Waiver wire"
      testId="waiver-wire"
      aside={`${rows.length} free agent${rows.length === 1 ? "" : "s"}`}
      info={`Every free agent in the league, ranked by the ${unit} a game he should score over his club's next five games. The same for everyone.`}
    >
      <div className="flex flex-wrap gap-2" role="group" aria-label="Position">
        <FilterToggle pressed={position === null} onPressedChange={() => pick(null)} testId="wire-filter-all">
          All
        </FilterToggle>
        {(["G", "F", "C"] as const).map((pos) => (
          <FilterToggle key={pos} pressed={position === pos} onPressedChange={(on) => pick(on ? pos : null)} testId={`wire-filter-${pos}`}>
            {pos}
          </FilterToggle>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyNotice testId="wire-empty">Every player the league can sign is on a roster.</EmptyNotice>
      ) : rated === 0 ? (
        <EmptyNotice testId="wire-unrated">
          Outlooks are worked out from each round&apos;s box scores; the first set is not in yet. Check back after the next update.
        </EmptyNotice>
      ) : null}

      {rows.length > 0 && filtered.length === 0 ? (
        <EmptyNotice testId="wire-filter-empty">No {position === "G" ? "guard" : position === "F" ? "forward" : "center"} is a free agent.</EmptyNotice>
      ) : null}

      {shown.length > 0 ? (
        <>
          <div className="flex items-baseline justify-between px-3">
            <span className="slot-label">
              Player<span className="sm:hidden"> · next games</span>
            </span>
            <span className="w-[7.5rem] shrink-0 sm:w-40">
              <TripletHead />
            </span>
          </div>
          <Slots label="Waiver wire" testId="wire-list">
            {shown.map((row) => (
              <Slot key={row.id} nowrap testId="wire-row">
                <span className="flex min-w-0 flex-col gap-1">
                  <PlayerCell row={row} />
                  {row.outlook ? (
                    <span className="flex flex-wrap gap-x-3 pl-[1.6875rem]">
                      {row.outlook.runs[0] ? <RunWord run={row.outlook.runs[0]} /> : null}
                      <span className="text-sm text-ink-soft">{CONFIDENCE_WORD[row.outlook.confidence]} confidence</span>
                    </span>
                  ) : null}
                </span>
                <span className="w-[7.5rem] shrink-0 sm:w-40">
                  {row.outlook ? (
                    <Triplet next={row.outlook.next} />
                  ) : (
                    <span className="block text-right text-sm text-ink-faint">No games yet</span>
                  )}
                </span>
              </Slot>
            ))}
          </Slots>
        </>
      ) : null}

      {filtered.length > shown.length ? (
        <button
          type="button"
          onClick={() => setLimit((current) => current + MORE)}
          data-testid="wire-more"
          className="slot-label inline-flex min-h-11 items-center justify-center border border-ink/50 px-3 text-ink transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          Show {Math.min(MORE, filtered.length - shown.length)} more
        </button>
      ) : null}
    </Bank>
  );
}
