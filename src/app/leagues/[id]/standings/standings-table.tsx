"use client";

import { useMemo, useState } from "react";
import Link from "next/link";

import {
  Bank,
  CardName,
  FilterToggle,
  Slot,
  Slots,
} from "@/components/board";
import { formatTenths } from "@/lib/stats/scoring";
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
}: {
  snapshots: RoundSnapshot[];
  names: Record<string, string>;
  leagueId: string;
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

      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">
          No counted games in the phases you have on.
        </p>
      ) : (
        <Bank
          label="The table"
          aside={`${rounds.length} round${rounds.length === 1 ? "" : "s"}`}
        >
          <Slots testId="standings-table">
            {rows.map((row, index) => (
              <Slot key={row.memberId} testId="standings-row" state="filled">
                <Link
                  href={`/leagues/${leagueId}/teams/${row.memberId}`}
                  data-testid="standings-team"
                  className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-3 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
                >
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex flex-wrap items-baseline gap-x-3">
                      <span className="slot-label tabular-nums">#{index + 1}</span>
                      <CardName>{names[row.memberId] ?? row.memberId}</CardName>
                    </span>
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums text-ink-soft">
                      {rounds.map((round) => (
                        <span key={round}>
                          R{round} {formatTenths(row.byRound[round] ?? 0)}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span
                    className="text-sm tabular-nums"
                    data-testid="standings-total"
                  >
                    {formatTenths(row.totalTenths)}
                  </span>
                </Link>
              </Slot>
            ))}
          </Slots>
        </Bank>
      )}
    </>
  );
}
