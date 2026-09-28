"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import { Bank, PositionPatch } from "@/components/board";
import type { Position } from "@/lib/engine";
import type { PoolPlayer } from "@/lib/rosters/queries";

const PAGE_SIZE = 40;

export function PoolBrowser({ players, clubs }: {
  players: readonly PoolPlayer[];
  clubs: readonly { code: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | "all">("all");
  const [club, setClub] = useState("all");
  const [limit, setLimit] = useState(PAGE_SIZE);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return players.filter((player) => (position === "all" || player.position === position)
      && (club === "all" || player.club_code === club)
      && (!term || `${player.name} ${player.club_name} ${player.club_code}`.toLocaleLowerCase().includes(term)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [players, query, position, club]);

  function filterPosition(next: Position | "all") { setPosition(next); setLimit(PAGE_SIZE); }
  function filterClub(next: string) { setClub(next); setLimit(PAGE_SIZE); }

  return <Bank framed label="Find a player" aside={`${filtered.length} shown`}>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)]">
      <label className="text-xs text-ink-soft">Search name or club
        <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setLimit(PAGE_SIZE); }} placeholder="Search players" className="mt-1 block min-h-11 w-full rounded border border-rule-strong bg-stock px-3 text-sm text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-live" data-testid="pool-search" />
      </label>
      <label className="text-xs text-ink-soft">Club
        <select value={club} onChange={(event) => filterClub(event.target.value)} className="mt-1 block min-h-11 w-full rounded border border-rule-strong bg-stock px-3 text-sm text-ink focus-visible:outline-2 focus-visible:outline-live">
          <option value="all">All clubs</option>
          {clubs.map((team) => <option key={team.code} value={team.code}>{team.name || team.code}</option>)}
        </select>
      </label>
    </div>
    <div role="group" aria-label="Position" className="flex flex-wrap gap-2">
      {(["all", "G", "F", "C"] as const).map((option) => <button key={option} type="button" aria-pressed={position === option} onClick={() => filterPosition(option)} className={`min-h-11 min-w-11 rounded border px-3 text-sm font-semibold focus-visible:outline-2 focus-visible:outline-live ${position === option ? "border-live bg-live-sunk text-live" : "border-rule-strong text-ink-soft hover:text-ink"}`}>{option === "all" ? "All" : option}</button>)}
    </div>
    <div aria-live="polite" className="text-xs text-ink-soft">Showing {Math.min(limit, filtered.length)} of {filtered.length} players</div>
    {filtered.length ? <ul className="divide-y divide-panel-border" data-testid="pool-results">{filtered.slice(0, limit).map((player) => <li key={player.id} className="flex min-h-14 items-center gap-3 py-2" data-testid="pool-player">
      <PositionPatch position={player.position} />
      <div className="min-w-0 flex-1"><Link href={`/players/${player.id}`} className="block truncate text-sm font-semibold text-ink hover:text-live focus-visible:outline-2 focus-visible:outline-live">{player.name}</Link><p className="truncate text-xs text-ink-soft">{player.club_name || player.club_code} · {player.source}{player.manual_lock ? " · locked" : ""}{!player.person_code ? " · no code" : ""}</p></div>
      {player.status !== "active" ? <span className={`text-xs ${player.status === "injured" || player.status === "doubtful" ? "text-loss" : "text-ink-soft"}`}>{player.status}</span> : null}
      <Link href={`/players/${player.id}`} aria-label={`View ${player.name}`} className="grid size-11 place-items-center text-live focus-visible:outline-2 focus-visible:outline-live">→</Link>
    </li>)}</ul> : <p className="py-4 text-sm text-ink-soft">No players match these filters.</p>}
    {limit < filtered.length ? <button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)} className="min-h-11 self-start rounded border border-rule-strong px-4 text-sm font-semibold text-ink hover:border-live">Show more players</button> : null}
  </Bank>;
}
