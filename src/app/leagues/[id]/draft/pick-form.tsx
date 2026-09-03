"use client";

import { useActionState, useMemo, useState, type KeyboardEvent } from "react";

import {
  Correction,
  Field,
  FilterToggle,
  PositionPatch,
  Slot,
  Slots,
  inputStyles,
  selectStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { makePick, type DraftResult } from "@/lib/drafts/actions";
import type { DraftView } from "@/lib/drafts/queries";
import type { Position } from "@/lib/engine";
import {
  NO_FILTERS,
  clubsIn,
  poolIndex,
  selectPool,
  type PoolFilters,
} from "@/lib/pool/search";

/**
 * Only what the pool needs. The page renders the board and the header on the
 * server, so passing the whole `DraftView` here would serialize the picks, the
 * member list and the board's shape into the RSC payload a second time — on a
 * phone, on draft night.
 */
type PoolProps = {
  pool: DraftView["pool"];
  isYourTurn: boolean;
  clockNeeds: DraftView["clockNeeds"];
  /** Whose legality is being shown, when it is not the viewer's. */
  clockMemberName: string | null;
};

/**
 * The player pool — slice 3.3.
 *
 * Filters, fuzzy search, and a keyboard path from an empty box to a landed
 * pick. All of it in the browser: the server sends the pool once and every
 * keystroke after that is local, which is the whole reason the blueprint asks
 * for a client-side search rather than a query per character.
 *
 * ## Nothing here decides anything
 *
 * The list narrows, mutes and highlights; `makePick` re-checks whose turn it
 * is, whether the draft is running and whether the pick is legal on every
 * submission (invariant §1). That is why a muted row **keeps its pick button**:
 * the UI's opinion about legality is not evidence, and a refusal that explains
 * itself in the league's own words ("You have all the Cs you can hold") is
 * better than a control that is silently absent. The filtering itself lives in
 * `src/lib/pool/search.ts`, tested as a function.
 *
 * ## The keyboard path, and why Enter does not pick
 *
 * Type to search, arrow to highlight, Enter to **arm**, Enter again to commit;
 * Escape disarms. A pick is undoable only by a commissioner rollback, and Enter
 * is the key people press to dismiss things — so the fast path is two
 * deliberate keystrokes rather than one accidental one. Arming also does the
 * design system a favour: the armed row's button is the *only* marker-red
 * action on the surface at any moment, which is the one-marker-action rule that
 * a list of 25 red buttons had been breaking 24 times over.
 *
 * A pointer still picks in one tap, on the row's own button. The guard is for
 * the path where a single keystroke could otherwise draft somebody.
 */
const START: DraftResult = { error: null };

/** How many rows the list draws. The pool is 324; a phone is not. */
const VISIBLE_ROWS = 30;

const POSITIONS: Position[] = ["G", "F", "C"];

export function PickForm({
  leagueId,
  view,
  canPick,
}: {
  leagueId: string;
  view: PoolProps;
  /** Your turn, and the draft actually running. The server re-checks both. */
  canPick: boolean;
}) {
  const [result, action] = useActionState(makePick, START);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PoolFilters>(NO_FILTERS);
  /** The row the keyboard is on, as an index into the visible rows. */
  const [highlighted, setHighlighted] = useState(0);
  /** The player id whose pick button is armed, or null. */
  const [armed, setArmed] = useState<string | null>(null);
  /**
   * Whether the keyboard has been used yet.
   *
   * The highlight is the *keyboard's* position, so showing it on first paint
   * made the top row look chosen by somebody before anybody had touched
   * anything — and on a phone, where nobody will touch an arrow key at all, it
   * is a permanently selected-looking row that means nothing.
   */
  const [keyboardUsed, setKeyboardUsed] = useState(false);

  /**
   * A manager entering somebody else's pick.
   *
   * 2.4 said so on every row's button ("Pick for them"). The Bank heading
   * directly above the list already reads "Pick for B Ballers", so the row was
   * repeating it 30 times — and at that length the button wrapped onto a second
   * line, doubling the height of every row in the list on a phone. The heading
   * owns *for whom*; the row owns *whom*. The filter that needs the name still
   * says it ("Legal for B Ballers"), because that one has no heading above it.
   */
  const onBehalf = !view.isYourTurn;

  // Built against the pool array, not on every keystroke: fuse builds its index
  // up front, and rebuilding it per character is the one way to make a 324-row
  // local search feel slow.
  const index = useMemo(() => poolIndex(view.pool), [view.pool]);

  const rows = useMemo(
    () =>
      selectPool({
        pool: view.pool,
        filters,
        query,
        needs: view.clockNeeds,
        index,
      }),
    [view.pool, filters, query, view.clockNeeds, index],
  );

  const shortlist = rows.slice(0, VISIBLE_ROWS);
  const clubs = useMemo(() => clubsIn(view.pool), [view.pool]);

  // Both of these are **derived**, not synced in an effect. Narrowing the list
  // can leave the highlight pointing past the end of it, or leave a row armed
  // that is no longer on screen — and the list can also narrow without anybody
  // typing, because a pick landing anywhere in the league re-renders this room.
  // Clamping at render handles every one of those cases; an effect that reset
  // the state afterwards would handle them a frame late, and only the ones it
  // had been given as dependencies.
  const cursor =
    shortlist.length === 0 ? 0 : Math.min(highlighted, shortlist.length - 1);
  const armedId = shortlist.some((row) => row.id === armed) ? armed : null;

  /** Every change to what is listed puts the keyboard back at the top. */
  const relist = () => {
    setHighlighted(0);
    setArmed(null);
  };

  const setFilter = <K extends keyof PoolFilters>(
    key: K,
    value: PoolFilters[K],
  ) => {
    setFilters((current) => ({ ...current, [key]: value }));
    relist();
  };

  const togglePosition = (position: Position) => {
    setFilters((current) => ({
      ...current,
      positions: current.positions.includes(position)
        ? current.positions.filter((one) => one !== position)
        : [...current.positions, position],
    }));
    relist();
  };

  /** Focus the armed row's button, so the second Enter lands on it. */
  const focusPickButton = (playerId: string) => {
    // Deferred a frame: the button only exists once React has rendered the
    // armed state, and focusing a node that is not there yet does nothing.
    // Queried off the document because `Slots` renders the `<ul>` and does not
    // forward a ref — and `pick-<id>` is unique on the page anyway.
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLButtonElement>(`[data-testid="pick-${playerId}"]`)
        ?.focus();
    });
  };

  const onSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (shortlist.length === 0) return;

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      setKeyboardUsed(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      const next = cursor + step;
      // Wraps at both ends: on a phone, holding an arrow to the bottom of a
      // 30-row list and having to hold it all the way back up is worse than
      // arriving at the top.
      setHighlighted(
        next < 0 ? shortlist.length - 1 : next >= shortlist.length ? 0 : next,
      );
      setArmed(null);
      return;
    }

    if (event.key === "Enter") {
      // Never submits the form itself: the search box is not inside one, and
      // this is the keystroke that must not be able to draft anybody.
      event.preventDefault();
      setKeyboardUsed(true);
      const row = shortlist[cursor];
      if (!row || !canPick) return;
      setArmed(row.id);
      focusPickButton(row.id);
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setArmed(null);
    }
  };

  const highlightedRow = shortlist[cursor];

  return (
    <div className="flex flex-col gap-4">
      {result.error ? (
        <Correction testId="pick-error">{result.error}</Correction>
      ) : null}

      <Field label="Find a player">
        <input
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            relist();
          }}
          onKeyDown={onSearchKeyDown}
          placeholder="Name or club — misspelling is fine"
          data-testid="pool-search"
          autoComplete="off"
          spellCheck={false}
          aria-describedby="pool-keys"
          className={inputStyles}
        />
      </Field>

      {/* Said once, next to the box it describes, rather than left for
          somebody to discover. It is also what makes the keyboard path
          discoverable at all — nothing else on the surface hints at it. */}
      <p id="pool-keys" className="slot-label text-ink-faint">
        {canPick
          ? "Arrows to move · Enter to arm · Enter again to pick · Esc to cancel"
          : "Arrows to move through the pool"}
      </p>

      {/* Two rows, not one that wraps: a position is a *which*, and the three
          below it are *whethers*. Left as a single wrapping run, "Hide drafted"
          landed on the same line as G F C and read as a fourth position. */}
      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="slot-label pb-2">Position</span>
        {POSITIONS.map((position) => (
          <FilterToggle
            key={position}
            testId={`filter-position-${position}`}
            pressed={filters.positions.includes(position)}
            onPressedChange={() => togglePosition(position)}
          >
            {position}
          </FilterToggle>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-x-4 gap-y-1">
        <span className="slot-label pb-2">Show</span>
        <FilterToggle
          testId="filter-hide-drafted"
          pressed={filters.hideDrafted}
          onPressedChange={(next) => setFilter("hideDrafted", next)}
        >
          Hide drafted
        </FilterToggle>
        <FilterToggle
          testId="filter-hide-unavailable"
          pressed={filters.hideUnavailable}
          onPressedChange={(next) => setFilter("hideUnavailable", next)}
        >
          Fit to play
        </FilterToggle>
        <FilterToggle
          testId="filter-legal-only"
          pressed={filters.legalOnly}
          onPressedChange={(next) => setFilter("legalOnly", next)}
        >
          {onBehalf && view.clockMemberName
            ? `Legal for ${view.clockMemberName}`
            : "Legal for me"}
        </FilterToggle>
      </div>

      <label className="flex flex-col gap-1">
        <span className="slot-label">Club</span>
        <select
          value={filters.club}
          onChange={(event) => setFilter("club", event.target.value)}
          data-testid="filter-club"
          className={selectStyles}
        >
          <option value="">Every club</option>
          {clubs.map((club) => (
            <option key={club} value={club}>
              {club}
            </option>
          ))}
        </select>
      </label>

      {/* The keyboard's position, spoken. PRODUCT.md asks for a draft room a
          screen reader can follow, and a highlight that only exists as a 5%
          ink wash is invisible to one. */}
      <p role="status" aria-live="polite" className="sr-only">
        {highlightedRow
          ? `${highlightedRow.name}, ${highlightedRow.club}, ${highlightedRow.position}${
              highlightedRow.drafted
                ? `, taken by ${highlightedRow.takenBy}`
                : highlightedRow.noRoom
                  ? ", no room left in that position"
                  : ""
            }${armedId === highlightedRow.id ? ", armed — press Enter to pick" : ""}`
          : "Nobody matches that"}
      </p>

      <Slots testId="pick-pool">
        {shortlist.map((player, position) => {
          const isHighlighted = position === cursor;
          const isArmed = armedId === player.id;
          return (
            <Slot
              key={player.id}
              state={isArmed ? "live" : "waiting"}
              testId="pool-row"
              // The keyboard's highlight is the same 5% ink wash the pointer
              // already gets on a whole-row link — an established material for
              // "attention is here", rather than a new one.
              className={`${keyboardUsed && isHighlighted && !isArmed ? "bg-ink/5" : ""} ${
                player.drafted || player.noRoom ? "text-ink-faint" : ""
              }`}
            >
              <span className="flex flex-wrap items-baseline gap-x-3">
                <span
                  className={`text-sm font-semibold uppercase tracking-[0.04em] ${
                    player.drafted ? "line-through decoration-1" : ""
                  }`}
                >
                  {player.name}
                </span>
                <span className="slot-label">{player.club}</span>
                <PositionPatch position={player.position} />
                {/* Every one of these is a word, not a colour. */}
                {player.status !== "active" ? (
                  <span className="slot-label">{player.status}</span>
                ) : null}
                {player.drafted ? (
                  <span className="slot-label" data-testid="pool-taken">
                    {String(player.takenAt).padStart(2, "0")} · {player.takenBy}
                  </span>
                ) : player.noRoom ? (
                  <span className="slot-label" data-testid="pool-no-room">
                    No room
                  </span>
                ) : null}
              </span>
              {canPick && !player.drafted ? (
                <form action={action}>
                  <input type="hidden" name="leagueId" value={leagueId} />
                  <input type="hidden" name="playerId" value={player.id} />
                  <SubmitButton
                    testId={`pick-${player.id}`}
                    // The armed row is the surface's one marker action. Every
                    // other row is ink, so red still means exactly what it
                    // means everywhere else in this app.
                    tone={isArmed ? "live" : "ink"}
                    compact
                    pendingLabel="Picking…"
                  >
                    Pick
                  </SubmitButton>
                </form>
              ) : null}
            </Slot>
          );
        })}
        {shortlist.length === 0 ? (
          <Slot state="waiting">
            <span className="text-sm text-ink-soft">
              Nobody left matching that.
            </span>
          </Slot>
        ) : null}
      </Slots>

      <p className="slot-label text-ink-faint" data-testid="pool-count">
        {rows.length > shortlist.length
          ? `Showing ${shortlist.length} of ${rows.length} matches`
          : `${rows.length} ${rows.length === 1 ? "match" : "matches"}`}
      </p>
    </div>
  );
}
