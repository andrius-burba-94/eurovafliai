"use client";

import { displayName } from "@/lib/players/name";
import { useEffect, useRef, useState } from "react";

import type { ComparisonPlayer } from "@/lib/stats/comparison-queries";

export function PlayerComparison({ players, onClose }: {
  players: readonly ComparisonPlayer[];
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [leftId, setLeftId] = useState(players[0]?.id ?? "");
  const [rightId, setRightId] = useState(players[1]?.id ?? players[0]?.id ?? "");
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!element.open) element.showModal();
  }, []);
  const left = players.find((player) => player.id === leftId);
  const right = players.find((player) => player.id === rightId);
  return (
    <dialog ref={dialog} onClose={onClose} aria-labelledby="comparison-title" className="fixed inset-y-0 right-0 left-auto m-0 ml-auto h-dvh w-full max-w-lg overflow-y-auto border-l border-panel-border bg-stock-panel p-5 text-ink backdrop:bg-black/60 sm:p-7" data-testid="player-comparison">
      <div className="flex items-start justify-between gap-4">
        <div><p className="slot-label text-live">Player research</p><h2 id="comparison-title" className="mt-1 text-xl font-semibold">Compare players</h2></div>
        <button type="button" onClick={() => dialog.current?.close()} aria-label="Close comparison" className="grid size-11 place-items-center rounded border border-rule-strong text-lg">×</button>
      </div>
      <p className="mt-3 text-sm text-ink-soft">Stored game scores, PIR and the next five fixtures. Missing data stays blank.</p>
      <div className="mt-6 grid grid-cols-2 gap-3">
        {([leftId, rightId] as const).map((id, index) => <label key={index} className="text-xs text-ink-soft">{index === 0 ? "First player" : "Second player"}
          <select value={id} onChange={(event) => index === 0 ? setLeftId(event.target.value) : setRightId(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-rule-strong bg-stock px-2 text-sm text-ink">
            {players.map((player) => <option key={player.id} value={player.id}>{displayName(player.name)}</option>)}
          </select>
        </label>)}
      </div>
      <div className="mt-5 grid grid-cols-[minmax(5rem,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b border-panel-border pb-2 text-xs text-ink-soft"><span>Measure</span><strong className="truncate text-ink">{left ? displayName(left.name) : "—"}</strong><strong className="truncate text-ink">{right ? displayName(right.name) : "—"}</strong></div>
      <ComparisonRow label="Recent fantasy" left={point(left?.estimateTenths)} right={point(right?.estimateTenths)} />
      <ComparisonRow label="Estimate from" left={left?.estimateSource ?? "No estimate"} right={right?.estimateSource ?? "No estimate"} />
      <ComparisonRow label="PIR average" left={point(left?.pirEstimateTenths)} right={point(right?.pirEstimateTenths)} />
      <ComparisonRow label="Last game" left={point(left?.lastGames.at(-1)?.fantasyTenths)} right={point(right?.lastGames.at(-1)?.fantasyTenths)} />
      <h3 className="mt-7 text-sm font-semibold">Last five games</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">{[left, right].map((player, index) => <div key={index} className="rounded border border-panel-border bg-stock p-3">
        <p className="mb-2 truncate text-xs font-semibold">{player ? displayName(player.name) : "—"}</p>
        {player?.lastGames.length ? <ol className="space-y-1 text-xs">{player.lastGames.map((game, itemIndex) => <li key={`${game.round}-${itemIndex}`} className="flex justify-between gap-2"><span className="text-ink-soft">R{game.round} · PIR {game.pir}</span><strong>{point(game.fantasyTenths)}</strong></li>)}</ol> : <p className="text-xs text-ink-soft">No stored games this season.</p>}
      </div>)}</div>
      <h3 className="mt-7 text-sm font-semibold">Next five fixtures</h3>
      <div className="mt-2 grid grid-cols-2 gap-3">{[left, right].map((player, index) => <div key={index} className="rounded border border-panel-border bg-stock p-3">
        <p className="mb-2 truncate text-xs font-semibold">{player?.clubCode ?? "—"}</p>
        {player?.nextFive.length ? <ol className="space-y-1 text-xs">{player.nextFive.map((game) => <li key={game.round} className="flex justify-between gap-2"><span>R{game.round} · {game.opponent}</span><span className={game.difficulty === "easy" ? "text-gain" : game.difficulty === "hard" ? "text-loss" : "text-ink-soft"}>{game.difficulty ?? "Unrated"}</span></li>)}</ol> : <p className="text-xs text-ink-soft">Fixtures not published.</p>}
      </div>)}</div>
    </dialog>
  );
}

function point(tenths: number | null | undefined): string {
  return tenths == null ? "—" : (tenths / 10).toFixed(1);
}

function ComparisonRow({ label, left, right }: { label: string; left: string; right: string }) {
  return <div className="grid grid-cols-[minmax(5rem,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-x-3 border-b border-panel-border py-3 text-sm"><span className="text-ink-soft">{label}</span><strong className="truncate tabular-nums">{left}</strong><strong className="truncate tabular-nums">{right}</strong></div>;
}
