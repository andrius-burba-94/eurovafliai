"use client";

import { useActionState, useMemo, useState, type KeyboardEvent } from "react";

import {
  CardName,
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
  /**
   * The viewer's own remaining room, used when they cannot pick.
   *
   * Eleven of twelve people in this league are spectators at any moment, and
   * the pool was muting against the *picker's* roster for all of them — so a
   * member holding four open centre slots watched the centres dim and read
   * "No room". Legality is only somebody else's business while you are the one
   * entering their pick.
   */
  yourNeeds: DraftView["yourNeeds"];
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

  // Whose legality this pool is about: the picker's if you are the one picking
  // (your turn, or a manager entering it for them), otherwise your own.
  const needs = canPick ? view.clockNeeds : view.yourNeeds;

  const rows = useMemo(
    () => selectPool({ pool: view.pool, filters, query, needs, index }),
    [view.pool, filters, query, needs, index],
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

  /**
   * Bound to the whole pool, not to the search box.
   *
   * Arming moves focus to the row's button, and with the handler on the input
   * that meant Escape and the arrows stopped working at exactly the moment the
   * hint above the list promised "Esc to cancel" — with a pick armed and a
   * clock running. Keydown bubbles, so listening at the container keeps every
   * key alive wherever focus has gone. The spec that "proved" Escape worked
   * only passed because `locator.press` focuses the input first.
   */
  const onPoolKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    // The club select owns its own arrows and Escape natively.
    if ((event.target as HTMLElement).tagName === "SELECT") return;

    if (event.key === "Escape") {
      event.preventDefault();
      setArmed(null);
      document
        .querySelector<HTMLInputElement>('[data-testid="pool-search"]')
        ?.focus();
      return;
    }

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

    // Enter on the armed button is the browser submitting that form, and must
    // pass straight through — that second Enter is the pick.
    if (
      event.key === "Enter" &&
      (event.target as HTMLElement).tagName !== "BUTTON"
    ) {
      event.preventDefault();
      setKeyboardUsed(true);
      const row = shortlist[cursor];
      // `!row.drafted` is the guard this was missing. A drafted row is in the
      // list whenever "hide drafted" is off, and arming one struck it in
      // marker, gave it the live blush, withheld the button that marker
      // promises, dropped focus on the floor, and left the live region
      // offering an action that could never happen — on a player somebody
      // already owns.
      if (!row || !canPick || row.drafted) return;
      setArmed(row.id);
      focusPickButton(row.id);
    }
  };

  return (
    <div className="flex flex-col gap-4" onKeyDown={onPoolKeyDown}>
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
          placeholder="Name or club — misspelling is fine"
          data-testid="pool-search"
          autoComplete="off"
          spellCheck={false}
          // iOS autocorrect owns the one input this whole slice exists to
          // serve, on the device draft night actually happens on, for surnames
          // it has never seen. "Valančiūnas" does not survive it.
          autoCorrect="off"
          autoCapitalize="none"
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

      {/* What the list did, spoken — and only what the list did.
          
          This used to narrate the top row's whole line, rebuilt from
          `shortlist[0]`. That fires on every character typed, every filter
          toggled, and every pick landing anywhere in the league, because all
          three re-list the pool: typing "valanciunas" queued eleven
          announcements of eleven different players nobody had navigated to,
          and a twelve-member draft added 156 more. Now it says the one thing
          that changed — how many are left — and leaves *which row* to
          `aria-current` on the row itself, which a reader reports when the
          user asks rather than when the app decides. */}
      <p role="status" aria-live="polite" className="sr-only">
        {rows.length === 0
          ? "Nobody left matching that."
          : `${rows.length} ${rows.length === 1 ? "player" : "players"} match.`}
      </p>

      <Slots testId="pick-pool">
        {shortlist.map((player, position) => {
          const isHighlighted = position === cursor;
          const isArmed = armedId === player.id;
          return (
            <Slot
              key={player.id}
              // Four states, and the drafted one is not `waiting`. A dashed
              // rule is this system's word for an empty place; a player
              // somebody already owns is the most settled row in the list.
              state={isArmed ? "live" : player.drafted ? "filled" : "waiting"}
              testId="pool-row"
              current={keyboardUsed && isHighlighted && !isArmed}
              nowrap
              // An armed row is never faded: `ink-faint` on the live blush is
              // 4.37:1, and the row you are about to commit is the last thing
              // that should be hard to read.
              className={
                (player.drafted || player.noRoom) && !isArmed
                  ? "text-ink-faint"
                  : ""
              }
            >
              <span className="flex min-w-0 flex-1 items-baseline gap-x-3 overflow-hidden">
                {/* `CardName scale="slot"`, not a bespoke class. The board
                    already made this mistake once — a one-off `text-xs` at
                    *display* tracking — and DESIGN.md records fixing it. */}
                <span
                  className={`min-w-0 truncate ${
                    player.drafted ? "line-through decoration-1" : ""
                  }`}
                  title={player.name}
                >
                  <CardName scale="slot">{player.name}</CardName>
                </span>
                <span className="slot-label">{player.club}</span>
                <PositionPatch position={player.position} />
                {/* Every one of these is a word, not a colour. */}
                {player.status !== "active" ? (
                  <span className="slot-label shrink-0">{player.status}</span>
                ) : null}
                {player.drafted ? (
                  <span
                    className="slot-label shrink-0"
                    data-testid="pool-taken"
                  >
                    {String(player.takenAt).padStart(2, "0")} · {player.takenBy}
                  </span>
                ) : player.noRoom ? (
                  <span
                    className="slot-label shrink-0"
                    data-testid="pool-no-room"
                  >
                    No room
                  </span>
                ) : null}
              </span>
              {canPick && !player.drafted ? (
                <form action={action} className="shrink-0">
                  <input type="hidden" name="leagueId" value={leagueId} />
                  <input type="hidden" name="playerId" value={player.id} />
                  <SubmitButton
                    testId={`pick-${player.id}`}
                    // The armed row is the surface's one marker action. Every
                    // other row is ink, so red still means exactly what it
                    // means everywhere else in this app.
                    // Inside a live row the label cannot be marker red:
                    // `live` on `live-sunk` is 4.15:1 and DESIGN.md forbids the
                    // pairing by name — which 3.3 shipped anyway, on the one
                    // control it matters most for. Full-strength marker border,
                    // ink label.
                    tone={isArmed ? "liveOnField" : "ink"}
                    compact
                    ariaLabel={`Pick ${player.name}`}
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
