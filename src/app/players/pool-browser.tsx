"use client";

import { displayName, surname } from "@/lib/players/name";
import { useMemo, useState } from "react";

import { Bank, FilterToggle, PositionPatch } from "@/components/board";
import { StatusBadge, availabilityBadge } from "@/components/broadcast";
import { ClubCrest, PlayerPortrait } from "@/components/official-media";
import { PlayerStatsLink } from "@/components/player-stats-link";
import type { Position } from "@/lib/engine";
import type { PoolPlayer } from "@/lib/rosters/queries";
import { formatTenths } from "@/lib/stats/scoring";

const PAGE_SIZE = 40;
const nameKey = (name: string) => `${surname(name)}, ${displayName(name)}`;

/**
 * The pool as a scouting board (ADR-0011): ranked by the one average PIR the
 * draft and the side panel rank on, with quick filters for a position, a club
 * and who is hurt. Alphabetical is a choice, not the default.
 */
export function PoolBrowser({ players, clubs }: {
  players: readonly PoolPlayer[];
  clubs: readonly { code: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState<Position | "all">("all");
  const [club, setClub] = useState("all");
  const [sort, setSort] = useState<"pir" | "name">("pir");
  const [hurtOnly, setHurtOnly] = useState(false);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase();
    return players
      .filter((player) => (position === "all" || player.position === position)
        && (club === "all" || player.club_code === club)
        && (!hurtOnly || player.status === "injured" || player.status === "doubtful")
        && (!term || `${player.name} ${displayName(player.name)} ${player.club_name} ${player.club_code}`.toLocaleLowerCase().includes(term)))
      .sort((a, b) => sort === "name"
        ? nameKey(a.name).localeCompare(nameKey(b.name))
        : (b.pirTenths ?? -1) - (a.pirTenths ?? -1) || nameKey(a.name).localeCompare(nameKey(b.name)));
  }, [players, query, position, club, sort, hurtOnly]);

  const reset = () => setLimit(PAGE_SIZE);

  return <Bank framed label="Find a player" aside={`${filtered.length} shown`}>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(10rem,14rem)]">
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">Search name or club
        <input type="search" value={query} onChange={(event) => { setQuery(event.target.value); reset(); }} placeholder="Search players" className="block min-h-11 w-full rounded-lg border border-rule bg-stock px-3 text-base text-ink placeholder:text-ink-faint focus:border-live focus:outline-2 focus:outline-live/40" data-testid="pool-search" />
      </label>
      <label className="flex flex-col gap-1.5 text-sm font-medium text-ink-soft">Club
        <select value={club} onChange={(event) => { setClub(event.target.value); reset(); }} className="block min-h-11 w-full appearance-none rounded-lg border border-rule bg-stock px-3 text-base text-ink focus:border-live focus:outline-2 focus:outline-live/40">
          <option value="all">All clubs</option>
          {clubs.map((team) => <option key={team.code} value={team.code}>{team.name || team.code}</option>)}
        </select>
      </label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div role="group" aria-label="Position" className="flex flex-wrap gap-1.5">
        {(["all", "G", "F", "C"] as const).map((option) => (
          <FilterToggle key={option} pressed={position === option} onPressedChange={() => { setPosition(option); reset(); }}>
            {option === "all" ? "All" : option}
          </FilterToggle>
        ))}
        <FilterToggle testId="pool-hurt" pressed={hurtOnly} onPressedChange={(next) => { setHurtOnly(next); reset(); }}>
          Injured
        </FilterToggle>
      </div>
      <div role="group" aria-label="Sort" className="flex rounded-full border border-rule p-0.5">
        {([["pir", "By PIR"], ["name", "A–Z"]] as const).map(([key, label]) => (
          <button key={key} type="button" aria-pressed={sort === key} onClick={() => setSort(key)} className={`min-h-10 rounded-full px-3.5 text-sm font-semibold ${sort === key ? "bg-stock-high text-ink" : "text-ink-soft hover:text-ink"}`}>
            {label}
          </button>
        ))}
      </div>
    </div>
    <div aria-live="polite" className="text-xs text-ink-soft">Showing {Math.min(limit, filtered.length)} of {filtered.length} players</div>
    {filtered.length ? <ul className="divide-y divide-panel-border" data-testid="pool-results">{filtered.slice(0, limit).map((player) => {
      const badge = availabilityBadge(player.status);
      return <li key={player.id} className="flex min-h-14 items-center gap-3 py-2" data-testid="pool-player">
        <PositionPatch position={player.position} />
        <PlayerPortrait personCode={player.person_code} name={player.name} />
        <div className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <PlayerStatsLink id={player.id} name={player.name} className="block truncate text-sm font-semibold text-ink hover:text-live focus-visible:outline-2 focus-visible:outline-live">{displayName(player.name)}</PlayerStatsLink>
            {badge ? <StatusBadge kind={badge.kind}>{player.status}</StatusBadge> : null}
          </span>
          <p className="flex items-center gap-1 truncate text-xs text-ink-soft"><ClubCrest clubCode={player.club_code} />{player.club_name || player.club_code}<span className="text-ink-faint"> · {player.source}{player.manual_lock ? " · locked" : ""}{!player.person_code ? " · no code" : ""}</span></p>
        </div>
        <span className="flex w-14 shrink-0 flex-col items-end">
          <span className="stat text-sm font-bold">{player.pirTenths === undefined ? "—" : formatTenths(player.pirTenths)}</span>
          <span className="text-[0.6875rem] text-ink-faint">{player.pirSource === "last5" ? "PIR · form" : player.pirSource === "prev" ? "PIR · last yr" : "PIR"}</span>
        </span>
        <PlayerStatsLink id={player.id} name={player.name} ariaLabel={`View ${displayName(player.name)} stats`} className="grid size-11 place-items-center text-live focus-visible:outline-2 focus-visible:outline-live">→</PlayerStatsLink>
      </li>;
    })}</ul> : <p className="py-4 text-sm text-ink-soft">No players match these filters.</p>}
    {limit < filtered.length ? <button type="button" onClick={() => setLimit((current) => current + PAGE_SIZE)} className="min-h-11 self-start rounded-lg border border-rule-strong px-4 text-sm font-semibold text-ink hover:border-ink-soft">Show more players</button> : null}
  </Bank>;
}
