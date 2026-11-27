"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";

import { Bank } from "@/components/board";
import { TeamCrest } from "@/components/broadcast";
import { InfoTip } from "@/components/info-tip";
import { NavIcon } from "@/components/nav-icons";
import { ClubCrest } from "@/components/official-media";
import { clubColor } from "@/lib/clubs/colors";
import {
  BOX_COLUMNS,
  columnLeaders,
  nextSort,
  sortRows,
  teamTotals,
  type BoxRow,
  type Sort,
  type SortKey,
} from "@/lib/live/game-box";
import { displayName, surname } from "@/lib/players/name";
import type { CrestShape, TeamColor } from "@eurovafliai/core/teams/identity";

export type BoxSide = {
  readonly code: string;
  readonly name: string;
};

/** One of the viewer's own teams that holds a player this round. */
export type BoxHolding = {
  readonly league: string;
  readonly team: string;
  /** The league this page was opened from. */
  readonly here: boolean;
};

export type BoxOwner = {
  readonly name: string;
  readonly color: TeamColor;
  readonly crest: CrestShape;
  readonly you: boolean;
};

type View = "both" | "home" | "away";

/**
 * What a club's table keeps when both clubs stand side by side on a wide
 * screen: the box score's most read figures, scrolling sideways where they do
 * not fit. It folds away 2P, the rebound split, blocks against and fouls
 * drawn. One club alone always shows every column; so does a phone.
 */
const PAIR_COLUMNS: ReadonlySet<SortKey> = new Set<SortKey>(["min", "pts", "reb", "ast", "pir", "fp", "fg", "fg3", "ft", "stl", "tov", "blk", "pf", "pm"]);
// Classes for "wide enough for two tables of the pair columns" (a 60rem box), spelled
// out whole so Tailwind's scanner finds them.

const focusRing = "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live";

/**
 * A game's box score: one table per club, every column sortable, and a switch
 * to show one club alone. The rows arrive from the server render — a live
 * snapshot re-renders the page — so the sort and the switch survive an update,
 * and a figure the update changed washes once in gain.
 */
export function BoxScore({
  home,
  away,
  rows,
  owners,
  mine,
  links,
  live,
  bank,
  testId = "box-score",
}: {
  /** The section around it: the switch sits on its heading's line. */
  bank: { readonly label: string; readonly info?: ReactNode; readonly aside?: ReactNode; readonly testId?: string };
  home: BoxSide;
  away: BoxSide;
  rows: readonly BoxRow[];
  /** Person code → the league team holding the player this round. */
  owners: Readonly<Record<string, BoxOwner>>;
  /** Person code → the viewer's own teams holding the player, across every league. */
  mine: Readonly<Record<string, readonly BoxHolding[]>>;
  /** Person code → the player's page. */
  links: Readonly<Record<string, string>>;
  /** The feed is in play, so who is on the court means something. */
  live: boolean;
  testId?: string;
}) {
  const [view, setView] = useState<View>("both");
  const [sort, setSort] = useState<Sort>(null);
  const [seen, setSeen] = useState(rows);
  const [flash, setFlash] = useState<{ version: number; keys: ReadonlySet<string> }>({ version: 0, keys: new Set() });

  // A new render from the server: mark what moved since the last one this viewer saw.
  if (rows !== seen) {
    const before = new Map<string, string>(seen.flatMap((row) => BOX_COLUMNS.map((column) => [`${row.personCode}|${column.key}`, column.text(row)] as const)));
    const keys = new Set<string>();
    for (const row of rows) {
      for (const column of BOX_COLUMNS) {
        const key = `${row.personCode}|${column.key}`;
        const was = before.get(key);
        if (was !== undefined && was !== column.text(row)) keys.add(key);
      }
    }
    setSeen(rows);
    setFlash({ version: flash.version + 1, keys });
  }

  const sides = [
    { side: home, which: "home" as const },
    { side: away, which: "away" as const },
  ].filter(({ which }) => view === "both" || view === which);

  return (
    <Bank
      framed
      label={bank.label}
      info={bank.info}
      aside={bank.aside}
      testId={bank.testId}
      toolbar={
        <>
          <div role="group" aria-label="Show players from" className="inline-flex rounded-full border border-rule-strong p-1" data-testid={`${testId}-switch`}>
            <ViewButton pressed={view === "both"} onPress={() => setView("both")} testId={`${testId}-both`}>
              Both
            </ViewButton>
            {[{ side: home, which: "home" as const }, { side: away, which: "away" as const }].map(({ side, which }) => (
              <ViewButton key={which} pressed={view === which} onPress={() => setView(which)} club={side.code} testId={`${testId}-${which}`}>
                <ClubCrest clubCode={side.code} />
                <span className="sr-only sm:not-sr-only sm:max-w-56 sm:truncate">{side.name}</span>
              </ViewButton>
            ))}
          </div>
          {sort ? (
            <button
              type="button"
              onClick={() => setSort(null)}
              className={`inline-flex min-h-11 items-center rounded-md px-2 text-sm font-semibold text-live hover:underline ${focusRing}`}
              data-testid={`${testId}-reset`}
            >
              Starters first
            </button>
          ) : (
            <p className="text-xs text-ink-soft">Tap a column to sort</p>
          )}
        </>
      }
    >
      <div className="@container/box flex flex-col gap-4" data-testid={testId} data-view={view} data-sort={sort ? `${sort.key}-${sort.direction}` : "official"}>
        <div className={`grid gap-6 ${view === "both" ? "@min-[60rem]/box:grid-cols-2 @min-[60rem]/box:gap-3" : ""}`}>
          {sides.map(({ side, which }) => (
            <TeamTable
              key={which}
              side={side}
              rows={rows.filter((row) => row.clubCode === side.code)}
              sort={sort}
              onSort={(key) => setSort(nextSort(sort, key))}
              owners={owners}
              mine={mine}
              links={links}
              live={live}
              flash={flash}
              paired={view === "both"}
              testId={`${testId}-${which}-table`}
            />
          ))}
        </div>
      </div>
    </Bank>
  );
}

function ViewButton({
  pressed,
  onPress,
  club,
  children,
  testId,
}: {
  pressed: boolean;
  onPress: () => void;
  club?: string;
  children: React.ReactNode;
  testId: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      data-testid={testId}
      className={`relative inline-flex min-h-11 min-w-11 items-center justify-center gap-1.5 overflow-hidden rounded-full px-3.5 text-sm font-semibold transition-colors ${focusRing} ${
        pressed ? "bg-ink text-stock" : "text-ink-soft hover:bg-stock-high hover:text-ink"
      }`}
    >
      {children}
      {club && pressed ? (
        <span aria-hidden="true" className="absolute inset-x-3 bottom-1 h-0.5 rounded-full" style={{ background: clubColor(club) }} />
      ) : null}
    </button>
  );
}

function TeamTable({
  side,
  rows,
  sort,
  onSort,
  owners,
  mine,
  links,
  live,
  flash,
  paired,
  testId,
}: {
  side: BoxSide;
  rows: readonly BoxRow[];
  sort: Sort;
  onSort: (key: SortKey) => void;
  owners: Readonly<Record<string, BoxOwner>>;
  mine: Readonly<Record<string, readonly BoxHolding[]>>;
  links: Readonly<Record<string, string>>;
  live: boolean;
  flash: { version: number; keys: ReadonlySet<string> };
  /** Both clubs are shown, so on a wide screen this table sits beside the other. */
  paired: boolean;
  testId: string;
}) {
  const ordered = sortRows(rows, sort);
  const leaders = columnLeaders(rows);
  const totals = teamTotals(rows);
  const benchAt = sort ? -1 : ordered.findIndex((row) => row.starter === false || row.dnp);
  const hasStarters = rows.some((row) => row.starter);
  const captionId = `${testId}-caption`;
  // Beside the other club, a column outside the pair set folds away — unless it is the one sorted on.
  const fold = (key: SortKey) => (paired && !PAIR_COLUMNS.has(key) && sort?.key !== key ? "@min-[60rem]/box:hidden" : "");
  // Every column on one screen once the box is wide; a phone keeps its roomier, scrolling table.
  const tight = "@min-[60rem]/box:px-1";

  return (
    <section aria-labelledby={captionId} className="flex min-w-0 flex-col gap-2" data-testid={testId} data-club={side.code}>
      <h3 id={captionId} className="flex items-center gap-2">
        <span aria-hidden="true" className="h-5 w-1 rounded-full" style={{ background: clubColor(side.code) }} />
        <ClubCrest clubCode={side.code} />
        <span className={`display min-w-0 truncate text-lg ${paired ? "@min-[60rem]/box:text-base" : ""}`}>{side.name}</span>
      </h3>
      {rows.length === 0 ? (
        <p className="text-sm text-ink-soft">No players listed yet.</p>
      ) : (
        <div
          className={`relative -mx-4 scroll-pl-[13rem] overflow-x-auto overscroll-x-contain sm:mx-0 sm:scroll-pl-[18rem] ${paired ? "@min-[60rem]/box:scroll-pl-[11rem]" : ""}`}
          role="region"
          aria-label={`${side.name} box score, scrolls sideways`}
          tabIndex={0}
        >
          <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-sm @min-[60rem]/box:min-w-0">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 border-b border-rule bg-stock-panel py-1 pr-2 pl-4 text-left sm:pl-2">
                  <span className="slot-label">Player</span>
                </th>
                {BOX_COLUMNS.map((column) => {
                  const active = sort?.key === column.key;
                  return (
                    <th
                      key={column.key}
                      scope="col"
                      aria-sort={active ? (sort.direction === "desc" ? "descending" : "ascending") : undefined}
                      className={`border-b px-0 py-0 text-right ${active ? "border-live" : "border-rule"} ${column.key === "fp" ? "bg-live-sunk" : ""} ${fold(column.key)}`}
                    >
                      <button
                        type="button"
                        onClick={() => onSort(column.key)}
                        title={column.title}
                        aria-label={`${column.title}${active ? (sort.direction === "desc" ? ", highest first" : ", lowest first") : ""}. Sort`}
                        data-testid={`${testId}-sort-${column.key}`}
                        className={`inline-flex min-h-11 w-full min-w-11 items-center justify-end gap-0.5 px-1.5 text-xs font-bold tracking-[0.06em] uppercase transition-colors pointer-fine:min-h-8 @min-[60rem]/box:tracking-normal pointer-fine:min-w-0 hover:text-ink ${tight} ${focusRing} ${
                          active ? "text-live" : "text-ink-soft"
                        }`}
                      >
                        {column.label}
                        <span aria-hidden="true" className={`w-2 text-[0.625rem] @min-[60rem]/box:w-1.5 @min-[60rem]/box:text-[0.5rem] ${active ? "" : "opacity-0"}`}>
                          {active && sort.direction === "asc" ? "▲" : "▼"}
                        </span>
                      </button>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ordered.map((row, index) => {
                const owner = owners[row.personCode];
                const holdings = mine[row.personCode] ?? [];
                const href = links[row.personCode];
                const yours = owner?.you ?? false;
                const ground = yours ? "bg-live-sunk" : "bg-stock-panel";
                return (
                  <FragmentRow key={row.personCode} bench={hasStarters && index === benchAt && index > 0}>
                    <tr data-testid={`${testId}-row`} data-person={row.personCode} data-dnp={row.dnp ? "true" : undefined} className={`${yours ? "bg-live-sunk" : ""} ${row.dnp ? "text-ink-faint" : ""}`}>
                      <th scope="row" className={`sticky left-0 z-10 border-b border-panel-border py-0 pr-2 pl-4 text-left font-normal sm:pl-2 ${paired ? "@min-[60rem]/box:pr-1" : ""} ${ground}`}>
                        <span className={`flex min-w-0 items-center gap-2 ${paired ? "@min-[60rem]/box:gap-1.5" : ""}`}>
                          <span className="stat w-5 shrink-0 text-right text-xs text-ink-faint">{row.dorsal}</span>
                          {live && row.onCourt ? (
                            <span className="text-on-air" title="On the court">
                              <span aria-hidden="true" className="on-air-dot" />
                              <span className="sr-only">On the court:</span>
                            </span>
                          ) : null}
                          <PlayerName row={row} href={href} paired={paired} />
                          {row.starter && sort ? <span className="text-[0.625rem] font-bold text-ink-faint" title="Starter">S</span> : null}
                          {holdings.length > 0 ? <YoursMark holdings={holdings} testId={`${testId}-yours`} /> : null}
                          {owner && !owner.you ? (
                            <span title={`Held by ${owner.name}`} className="flex shrink-0 items-center">
                              <TeamCrest name={owner.name} color={owner.color} shape={owner.crest} size={18} />
                              <span className="sr-only">, held by {owner.name}</span>
                            </span>
                          ) : null}
                          {row.dnp ? <span className={`text-[0.625rem] font-bold tracking-[0.06em] text-ink-faint uppercase ${paired ? "@min-[60rem]/box:sr-only" : ""}`}>DNP</span> : null}
                        </span>
                      </th>
                      {BOX_COLUMNS.map((column) => {
                        const key = `${row.personCode}|${column.key}`;
                        const flashed = flash.keys.has(key);
                        const lead = !row.dnp && leaders[column.key] !== undefined && column.value(row) === leaders[column.key];
                        const text = row.dnp ? "–" : column.text(row);
                        return (
                          <td
                            key={column.key}
                            className={`stat border-b border-panel-border px-1.5 py-1.5 text-right whitespace-nowrap pointer-fine:py-0.5 ${tight} ${fold(column.key)} ${column.key === "fp" ? (yours ? "" : "bg-live-sunk/60") : ""} ${
                              sort?.key === column.key ? "font-semibold text-ink" : ""
                            } ${column.key === "pm" && !row.dnp ? (row.pm > 0 ? "text-gain" : row.pm < 0 ? "text-loss" : "") : ""}`}
                          >
                            <span
                              key={flashed ? flash.version : "still"}
                              data-moment="stat"
                              data-playing={flashed ? "" : undefined}
                              className={`inline-block rounded px-1 @min-[60rem]/box:px-0.5 ${lead ? "font-extrabold text-gold" : ""} ${column.key === "fp" && !row.dnp ? "font-semibold text-live" : ""}`}
                            >
                              {text}
                              {lead ? <span className="sr-only"> (team high)</span> : null}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  </FragmentRow>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="font-semibold" data-testid={`${testId}-totals`}>
                <th scope="row" className="sticky left-0 z-10 bg-stock-panel py-2 pr-2 pl-4 text-left sm:pl-2 pointer-fine:py-1.5">
                  <span className="slot-label">Totals</span>
                </th>
                {BOX_COLUMNS.map((column) => (
                  <td key={column.key} className={`stat px-1.5 py-2 text-right whitespace-nowrap pointer-fine:py-1.5 ${column.key === "fp" ? "bg-live-sunk/60" : ""} ${tight} ${fold(column.key)}`}>
                    <span className="px-1">{column.key === "pm" ? "" : column.key === "min" ? "" : column.text(totals)}</span>
                  </td>
                ))}
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </section>
  );
}

/** A row, preceded by the bench's divider when the box score's own order reaches it. */
function FragmentRow({ bench, children }: { bench: boolean; children: React.ReactNode }) {
  return (
    <>
      {bench ? (
        <tr aria-hidden="true">
          <td colSpan={BOX_COLUMNS.length + 1} className="px-4 pt-3 pb-1 sm:px-2 pointer-fine:pt-1.5 pointer-fine:pb-0.5">
            <span className="slot-label text-ink-faint">Bench</span>
          </td>
        </tr>
      ) : null}
      {children}
    </>
  );
}

function PlayerName({ row, href, paired }: { row: BoxRow; href?: string; paired: boolean }) {
  const full = displayName(row.name);
  const short = surname(row.name);
  // Surname alone on a phone, and beside the other club on a wide screen.
  const label = (
    <>
      <span className={`truncate sm:hidden ${paired ? "@min-[60rem]/box:inline!" : ""}`}>{short}</span>
      <span className={`hidden truncate sm:inline ${paired ? "@min-[60rem]/box:hidden!" : ""}`}>{full}</span>
    </>
  );
  const shape = `flex min-h-11 min-w-0 max-w-36 items-center font-semibold pointer-fine:min-h-6.5 sm:max-w-52 ${paired ? "@min-[60rem]/box:max-w-26" : "@min-[60rem]/box:max-w-44"}`;
  return href ? (
    <Link href={href} title={full} className={`${shape} hover:text-live hover:underline ${focusRing}`}>
      {label}
    </Link>
  ) : (
    <span title={full} className={shape}>
      {label}
    </span>
  );
}

/** The viewer holds this player: every league and team that does, on hover, focus or tap. */
function YoursMark({ holdings, testId }: { holdings: readonly BoxHolding[]; testId: string }) {
  const ordered = [...holdings].sort((a, b) => Number(b.here) - Number(a.here) || a.league.localeCompare(b.league));
  return (
    <InfoTip
      testId={testId}
      triggerClassName="relative inline-grid size-6 shrink-0 place-items-center rounded-full bg-live text-stock before:absolute before:-inset-2 before:content-['']"
      trigger={
        <>
          <NavIcon name="team" />
          <span className="sr-only">On your team</span>
        </>
      }
    >
      <span className="block font-semibold">On your team{ordered.length > 1 ? ` in ${ordered.length} leagues` : ""}</span>
      <ul className="mt-1 flex flex-col gap-0.5">
        {ordered.map((holding) => (
          <li key={`${holding.league}|${holding.team}`}>
            {holding.league} · <span className="text-ink-soft">{holding.team}</span>
          </li>
        ))}
      </ul>
    </InfoTip>
  );
}
