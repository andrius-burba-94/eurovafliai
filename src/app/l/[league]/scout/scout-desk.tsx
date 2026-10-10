"use client";

import { useState, type ReactNode } from "react";

/**
 * Preview A, "the desk" (#193): your moves and the wire are two places. Tabs
 * on a phone, side by side from `lg`, where both are always shown.
 */
export function ScoutDesk({
  moves,
  wire,
  movesCount,
  wireCount,
}: {
  moves: ReactNode;
  wire: ReactNode;
  movesCount: number;
  wireCount: number;
}) {
  const [tab, setTab] = useState<"moves" | "wire">("moves");
  return (
    <div className="flex flex-col gap-6">
      <div role="tablist" aria-label="Scout" className="grid grid-cols-2 rounded-full border border-rule-strong p-1 lg:hidden">
        {(["moves", "wire"] as const).map((key) => (
          <button
            key={key}
            role="tab"
            type="button"
            id={`scout-tab-${key}`}
            aria-selected={tab === key}
            aria-controls={`scout-panel-${key}`}
            data-testid={`scout-tab-${key}`}
            onClick={() => setTab(key)}
            className={`min-h-11 rounded-full text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
              tab === key ? "bg-ink text-stock" : "text-ink-soft hover:text-ink"
            }`}
          >
            {key === "moves" ? `Your moves · ${movesCount}` : `Waiver wire · ${wireCount}`}
          </button>
        ))}
      </div>
      <div className="grid gap-8 lg:grid-cols-[1.35fr_1fr] lg:items-start">
        <div id="scout-panel-moves" role="tabpanel" aria-labelledby="scout-tab-moves" className={`${tab === "moves" ? "flex" : "hidden"} flex-col gap-6 lg:flex`}>
          {moves}
        </div>
        <div id="scout-panel-wire" role="tabpanel" aria-labelledby="scout-tab-wire" className={`${tab === "wire" ? "flex" : "hidden"} flex-col lg:flex`}>
          {wire}
        </div>
      </div>
    </div>
  );
}
