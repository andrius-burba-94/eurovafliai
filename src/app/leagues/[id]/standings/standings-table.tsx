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
              setOn((current) => ({ ...current, [phase]: next }))
            }
          >
            {phase}
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
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <span className="slot-label tabular-nums">#{index + 1}</span>
                    <Link
                      href={`/leagues/${leagueId}/teams/${row.memberId}`}
                      data-testid="standings-team"
                      className="min-w-0"
                    >
                      <CardName>{names[row.memberId] ?? row.memberId}</CardName>
                    </Link>
                  </span>
                  <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm tabular-nums text-ink-soft">
                    {rounds.map((round) => (
                      <span key={round}>
                        R{round} {formatTenths(row.byRound[round] ?? 0)}
                      </span>
                    ))}
                  </span>
                </span>
                <span className="text-sm tabular-nums" data-testid="standings-total">
                  {formatTenths(row.totalTenths)}
                </span>
              </Slot>
            ))}
          </Slots>
        </Bank>
      )}
    </>
  );
}
