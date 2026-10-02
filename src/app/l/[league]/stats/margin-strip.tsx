"use client";

import { useState } from "react";

export type MarginBar = {
  readonly round: number;
  /** Positive: the first team won the round; negative: the second did. */
  readonly marginHundredths: number;
  /** "Round 3: Monikutės Naktys by 12.40" or "Round 3: tied". */
  readonly said: string;
};

/**
 * One bar per round the two teams both played, above the line for the first
 * team and below for the second. Pointing at a bar, focusing it or tapping it
 * prints that round's margin underneath; until then the latest round is shown.
 */
export function MarginStrip({ rounds }: { rounds: readonly MarginBar[] }) {
  const [active, setActive] = useState<number | null>(null);
  const widest = Math.max(1, ...rounds.map((row) => Math.abs(row.marginHundredths)));
  const shown = rounds.find((row) => row.round === active) ?? rounds.at(-1);
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <ol className="flex h-16 items-stretch gap-1 overflow-x-auto" aria-label="Margin per round" onMouseLeave={() => setActive(null)}>
        {rounds.map((row) => {
          const share = `${Math.max(8, (Math.abs(row.marginHundredths) / widest) * 100)}%`;
          const on = shown?.round === row.round;
          return (
            <li key={row.round} className="flex shrink-0" data-testid="h2h-round">
              <button
                type="button"
                aria-label={row.said}
                aria-pressed={active === row.round}
                onMouseEnter={() => setActive(row.round)}
                onFocus={() => setActive(row.round)}
                onClick={() => setActive(row.round)}
                className={`flex w-6 flex-col rounded-block transition-opacity focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-live ${on ? "opacity-100" : "opacity-60 hover:opacity-100"}`}
              >
                <span className="flex flex-1 items-end">
                  {row.marginHundredths > 0 ? <span className="w-full rounded-t-block bg-gain" style={{ height: share }} /> : null}
                </span>
                <span className="h-px w-full bg-rule-strong" />
                <span className="flex flex-1 items-start">
                  {row.marginHundredths < 0 ? <span className="w-full rounded-b-block bg-loss" style={{ height: share }} /> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="stat min-h-4 text-xs text-ink-soft" data-testid="h2h-caption">
        {shown?.said}
      </p>
    </div>
  );
}
