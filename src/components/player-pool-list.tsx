"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

import {
  CardBlock,
  CardBlocks,
  CardName,
  EmptyNotice,
  FilterToggle,
  FixtureNote,
  PositionPatch,
  inputStyles,
} from "@/components/board";
import type { PlayerFixture } from "@/lib/fixtures/types";
import type { Position } from "@/lib/engine";
import {
  NO_FILTERS,
  narrowedBy,
  poolIndex,
  selectPool,
  type PoolPlayer,
} from "@/lib/pool/search";
import { formatTenths } from "@/lib/stats/scoring";

/**
 * The league's pool as a searchable list of player cards — the side panel's
 * Players tab, slice 11.2.
 *
 * Built on the draft room's own selection (`selectPool`): the same fuzzy
 * search, the same exact-club-code rule and the same G/F/C filter, so the two
 * lists never disagree about who matches "valanciunas". It is a reading
 * surface — a row links to the player, and nothing here picks anybody.
 *
 * Shown `SHOWN` cards at a time, with a button for the next batch. With no
 * search the order is average PIR, best first. Alphabetical browsing never got
 * past the Bs, and the panel sits beside a lineup, where the question is who is
 * producing. A search keeps `selectPool`'s own ranking by match.
 */
const SHOWN = 40;

const POSITION_WORD: Record<Position, string> = {
  G: "Guards",
  F: "Forwards",
  C: "Centers",
};

export function PlayerPoolList({
  players,
  fixtures,
}: {
  players: readonly PoolPlayer[];
  fixtures: Readonly<Record<string, PlayerFixture>>;
}) {
  const [query, setQuery] = useState("");
  const [positions, setPositions] = useState<Position[]>([]);
  const [freeOnly, setFreeOnly] = useState(false);
  const [limit, setLimit] = useState(SHOWN);
  const index = useMemo(() => poolIndex(players), [players]);

  const filters = { ...NO_FILTERS, positions, hideDrafted: freeOnly };
  const matched = selectPool({ pool: players, filters, query, needs: null, index });
  const rows = query.trim() ? matched : byPir(matched);
  const shown = rows.slice(0, limit);
  const narrowing = narrowedBy(filters);

  const toggle = (position: Position) => {
    setLimit(SHOWN);
    setPositions((current) =>
      current.includes(position)
        ? current.filter((entry) => entry !== position)
        : [...current, position],
    );
  };

  return (
    <div className="flex flex-col gap-3" data-testid="panel-players">
      <label className="flex flex-col gap-1">
        <span className="sr-only">Search the pool</span>
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setLimit(SHOWN);
          }}
          placeholder="Search a name or a club code"
          data-testid="panel-search"
          className={inputStyles}
        />
      </label>
      <div
        role="group"
        aria-label="Filter the pool"
        className="flex flex-wrap items-end gap-1"
      >
        {(["G", "F", "C"] as const).map((position) => (
          <FilterToggle
            key={position}
            pressed={positions.includes(position)}
            onPressedChange={() => toggle(position)}
            testId={`panel-filter-${position}`}
          >
            <span aria-hidden="true">{position}</span>
            <span className="sr-only">{POSITION_WORD[position]}</span>
          </FilterToggle>
        ))}
        <FilterToggle
          pressed={freeOnly}
          onPressedChange={(pressed) => {
            setFreeOnly(pressed);
            setLimit(SHOWN);
          }}
          testId="panel-filter-free"
        >
          Free agents
        </FilterToggle>
      </div>
      <p className="slot-label" data-testid="panel-count">
        {rows.length === 0
          ? "No matches"
          : rows.length > shown.length
            ? `${shown.length} of ${rows.length} shown`
            : `${rows.length} ${rows.length === 1 ? "player" : "players"}`}
      </p>

      {rows.length === 0 ? (
        <EmptyNotice testId="panel-players-empty">
          Nobody matches
          {narrowing.length > 0 ? ` ${narrowing.join(", ")}` : ""}
          {query.trim() ? ` and “${query.trim()}”` : ""}.
        </EmptyNotice>
      ) : (
        <CardBlocks label="Players" testId="panel-player-list">
          {shown.map((player) => (
            <CardBlock
              key={player.id}
              position={player.position}
              testId="panel-player"
            >
              <Link
                href={`/players/${player.id}`}
                className="-mx-3 -my-3 flex min-h-11 min-w-0 items-center gap-3 px-3 py-3 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
              >
                <PositionPatch position={player.position} />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <CardName scale="slot">{player.name}</CardName>
                  <span className="text-sm text-ink-soft">
                    {player.club}
                    {player.status !== "active" ? ` · ${player.status}` : ""}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end gap-0.5">
                  <span
                    className={`stat text-sm ${
                      player.averagePir === null ? "text-ink-faint" : "text-ink"
                    }`}
                  >
                    {player.averagePir === null
                      ? "—"
                      : formatTenths(player.averagePir)}
                  </span>
                  <span className="slot-label">PIR</span>
                </span>
              </Link>
              <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <FixtureNote fixture={fixtures[player.club]} />
                <span className="slot-label" data-testid="panel-player-held">
                  {player.takenBy ?? "Free agent"}
                </span>
              </span>
            </CardBlock>
          ))}
        </CardBlocks>
      )}
      {rows.length > shown.length ? (
        <button
          type="button"
          onClick={() => setLimit((current) => current + SHOWN)}
          data-testid="panel-more"
          className="slot-label inline-flex min-h-11 items-center justify-center border border-ink/50 px-3 text-ink transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          Show {Math.min(SHOWN, rows.length - shown.length)} more
        </button>
      ) : null}
    </div>
  );
}

function byPir(rows: readonly PoolPlayer[]): PoolPlayer[] {
  return [...rows].sort(
    (a, b) => (b.averagePir ?? -Infinity) - (a.averagePir ?? -Infinity),
  );
}
