"use client";

import { displayName } from "@/lib/players/name";
import { useState, useTransition } from "react";

import { Correction, PositionPatch } from "@/components/board";
import { editCheatSheet, startSheetFromRanking } from "@/lib/sheets/actions";
import type { PoolPlayer } from "@/lib/sheets/store";

const pir = (tenths: number | null) => (tenths === null ? "—" : (tenths / 10).toFixed(1));

/**
 * The empty sheet's one act: a ranking written for you, to move around.
 * Pasting a list stays below for anyone who already keeps one.
 */
export function StartFromRanking({ leagueId, depth }: { leagueId: string; depth: number }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3 rounded-card border border-panel-border bg-stock-panel p-5">
      <p className="display text-2xl">Start from the ranking</p>
      <p className="max-w-[60ch] text-sm text-ink-soft">
        The top {depth} players by average PIR, in order. Then drag, nudge and
        remove until the order is yours.
      </p>
      <button
        type="button"
        data-testid="sheet-start"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const result = await startSheetFromRanking(leagueId);
            setError(result.error);
          })
        }
        className="min-h-11 w-full rounded-lg border border-live bg-live px-4 py-2.5 text-sm font-bold text-live-ink transition-colors hover:brightness-110 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live disabled:cursor-not-allowed disabled:opacity-60 sm:w-fit"
      >
        {pending ? "Writing your sheet…" : "Use the PIR ranking"}
      </button>
      {error ? <Correction testId="sheet-start-error">{error}</Correction> : null}
    </div>
  );
}

/**
 * The best players the sheet does not hold yet. Adding puts a player at the
 * bottom, where the list above can move them up; the server applies it as an
 * `insert`, so a second tap cannot rank anyone twice.
 */
export function SheetSuggestions({
  leagueId,
  players,
  rankedCount,
}: {
  leagueId: string;
  players: readonly PoolPlayer[];
  rankedCount: number;
}) {
  const [pending, start] = useTransition();
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (players.length === 0) return null;

  return (
    <section aria-labelledby="sheet-suggestions-title" data-testid="sheet-suggestions" className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="sheet-suggestions-title" className="display text-2xl">
          Not on your sheet
        </h2>
        <span className="slot-label text-ink-soft">By average PIR</span>
      </div>
      <ul role="list" className="flex flex-col divide-y divide-rule rounded-card border border-panel-border bg-stock-panel">
        {players.map((player) => (
          <li key={player.id} className="flex min-h-12 items-center gap-3 px-3 py-1.5">
            <PositionPatch position={player.position} />
            <span className="min-w-0 flex-1 truncate font-semibold">{displayName(player.name)}</span>
            <span className="slot-label hidden text-ink-soft sm:inline">{player.club}</span>
            <span className="stat w-10 text-right text-sm tabular-nums">{pir(player.tenths)}</span>
            <button
              type="button"
              aria-label={`Add ${displayName(player.name)} to your sheet`}
              disabled={pending && adding === player.id}
              onClick={() => {
                setAdding(player.id);
                start(async () => {
                  const result = await editCheatSheet(leagueId, {
                    kind: "insert",
                    playerId: player.id,
                    atRank: rankedCount + 1,
                  });
                  setError(result.error);
                  setAdding(null);
                });
              }}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-rule-strong px-3 text-sm font-semibold hover:border-live hover:text-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live disabled:opacity-60"
            >
              <span aria-hidden="true">{pending && adding === player.id ? "…" : "+ Add"}</span>
            </button>
          </li>
        ))}
      </ul>
      {error ? <Correction testId="sheet-suggestions-error">{error}</Correction> : null}
    </section>
  );
}
