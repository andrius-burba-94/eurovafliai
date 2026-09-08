"use client";

import Link from "next/link";
import { useMemo, useState, type KeyboardEvent } from "react";

import {
  CardName,
  Field,
  FilterToggle,
  PositionPatch,
  Slot,
  Slots,
  inputStyles,
  selectStyles,
} from "@/components/board";

import { useArmedPick } from "./armed-pick";
import type { DraftView } from "@/lib/drafts/queries";
import type { Position } from "@/lib/engine";
import {
  NO_FILTERS,
  clubsIn,
  poolIndex,
  selectPool,
  type PoolFilters,
  type SheetPlaces,
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
   * member holding four open center slots watched the centers dim and read
   * "No room". Legality is only somebody else's business while you are the one
   * entering their pick.
   */
  yourNeeds: DraftView["yourNeeds"];
  /** Whose legality is being shown, when it is not the viewer's. */
  clockMemberName: string | null;
  /** The viewer's own cheat sheet — slice 3.4. Empty when they have not written one. */
  sheet: DraftView["sheet"];
  /** Best available from it, already ranked and legality-checked by the server. */
  bestFromSheet: DraftView["bestFromSheet"];
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


/**
 * How many rows the list draws at rest, and how many when asked for more.
 *
 * Eight, not thirty. 3.3 shipped thirty and logged the reason it was wrong: an
 * untouched pool listed thirty of 324 players alphabetically, which is the
 * least useful thirty the app could pick, and it pushed the board a very long
 * scroll down a phone for anybody who was only watching. The honest answer was
 * always that a resting pool should be short and *ranked* — and ranked means a
 * cheat sheet, which is this slice.
 *
 * So eight rows, in the viewer's own order when they have a sheet, with the
 * pinned shortlist above them. Forty is there for browsing, behind a toggle,
 * because a pool you cannot scroll is a different loss.
 */
const RESTING_ROWS = 8;
const EXPANDED_ROWS = 40;

const POSITIONS: Position[] = ["G", "F", "C"];

/**
 * The one control that chooses a player, used by the pool row *and* the pinned
 * shortlist.
 *
 * They were two buttons, and they diverged exactly as two copies of one thing
 * do: the pinned one hardcoded `forTeamName: null`, so a manager arming from it
 * on somebody else's turn read "Drafting P01…" with **no team named** — a
 * mis-pick that spends another member's turn and is undoable only by a rollback
 * that deletes every pick after it. It also drew no armed material at all, and
 * kept saying `Choose` while the same player's pool row said `Chosen`. Found by
 * 3.7's critique, which measured both labels on screen at once.
 *
 * One component, so the divergence is unavailable rather than merely fixed.
 */
function ChooseButton({
  player,
  isArmed,
  forTeamName,
  arm,
  testId,
  ariaSuffix = "",
}: {
  player: { id: string; name: string };
  isArmed: boolean;
  forTeamName: string | null;
  arm: (pick: {
    playerId: string;
    playerName: string;
    forTeamName: string | null;
  }) => void;
  testId: string;
  ariaSuffix?: string;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        arm({ playerId: player.id, playerName: player.name, forTeamName })
      }
      data-testid={testId}
      // Follows the visible label. It was static `Choose …` while the button
      // read `Chosen`, which is a WCAG 2.5.3 Label-in-Name mismatch and offers
      // a screen reader the chance to "choose" a row already chosen.
      aria-label={`${isArmed ? "Chosen" : "Choose"} ${player.name}${ariaSuffix}`}
      // **Ink, not marker, even when chosen.** The armed row's own `slot-live`
      // rule already carries the state, and the band carries the *act* — so a
      // marker border here made two marker-red primary actions on one surface,
      // which DESIGN.md forbids by name, and gave "this slot is on the clock"
      // a second meaning 400px away. Preserving the old `SubmitButton` weight
      // avoided one regression by creating a worse one.
      className={`slot-label min-h-11 min-w-11 shrink-0 border px-3 text-ink transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
        isArmed ? "border-ink" : "border-ink/50 hover:border-ink/80"
      }`}
    >
      {isArmed ? "Chosen" : "Choose"}
    </button>
  );
}

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
  /**
   * The armed row is **shared with the sticky band** since 3.7, because that is
   * where the confirming tap now lands. See `armed-pick.tsx`: with the confirm
   * on the row's own button a fast double-tap armed and picked inside 200ms,
   * which is the fat-finger gesture the confirmation exists to stop.
   *
   * This component no longer submits a pick at all — `ConfirmPick` does. The
   * refusal still reaches the row, through the same context, because 3.3's
   * critique fixed refusals rendering thirty rows from the tap and moving the
   * confirm would otherwise have quietly undone it.
   */
  const { armed, arm, disarm, refused } = useArmedPick();
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<PoolFilters>(NO_FILTERS);
  /** The row the keyboard is on, as an index into the visible rows. */
  const [highlighted, setHighlighted] = useState(0);

  /**
   * Whether the keyboard has been used yet.
   *
   * The highlight is the *keyboard's* position, so showing it on first paint
   * made the top row look chosen by somebody before anybody had touched
   * anything — and on a phone, where nobody will touch an arrow key at all, it
   * is a permanently selected-looking row that means nothing.
   */
  const [keyboardUsed, setKeyboardUsed] = useState(false);
  /** The list has been asked for more than its resting eight rows. */
  const [expanded, setExpanded] = useState(false);

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

  /**
   * The viewer's sheet, as a lookup. Memoised against the array the server
   * sent, because the room re-renders on every pick in the league and rebuilding
   * a 60-entry map 156 times over is work nobody asked for.
   */
  const sheet: SheetPlaces = useMemo(
    () =>
      new Map(
        view.sheet.map((entry) => [
          entry.playerId,
          { rank: entry.rank, tier: entry.tier },
        ]),
      ),
    [view.sheet],
  );
  const hasSheet = sheet.size > 0;
  /** Which tiers the sheet actually has, so the filter offers only real ones. */
  const sheetTiers = useMemo(
    () =>
      [...new Set(view.sheet.map((entry) => entry.tier))].sort((a, b) => a - b),
    [view.sheet],
  );

  const rows = useMemo(
    () => selectPool({ pool: view.pool, filters, query, needs, index, sheet }),
    [view.pool, filters, query, needs, index, sheet],
  );

  /**
   * Whether the list has been narrowed by hand.
   *
   * The pinned shortlist and the pool are the *same three players* whenever the
   * pool is at rest, because `selectPool` orders it by the same sheet — 3.4a's
   * critique confirmed the player ids matched, so six of the eleven Pick
   * buttons on a phone were for three players. The block earns its place the
   * moment the pool stops showing them, and not before.
   */
  const narrowed =
    query.trim().length > 0 ||
    filters.positions.length > 0 ||
    filters.club !== "" ||
    filters.tier > 0 ||
    filters.sheetOnly ||
    filters.legalOnly ||
    filters.hideUnavailable ||
    !filters.hideDrafted;

  const pinned = narrowed ? view.bestFromSheet : [];

  const shortlist = rows.slice(0, expanded ? EXPANDED_ROWS : RESTING_ROWS);
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
  // Armed *and* still on screen. A filter or a search that hides the armed row
  // leaves the band holding it — which is right, because the band names the
  // player and is the thing you would cancel from.
  const armedId = armed?.playerId ?? null;

  /** Every change to what is listed puts the keyboard back at the top. */
  const relist = () => {
    setHighlighted(0);
    disarm();
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
      disarm();
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
      disarm();
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
      // Arms only. `ConfirmPick` takes focus the moment it appears, so the
      // second Enter drafts — the same two keystrokes 3.3 shipped, now through
      // the same mechanism a thumb uses rather than a second one beside it.
      arm({
        playerId: row.id,
        playerName: row.name,
        forTeamName: view.isYourTurn
          ? null
          : (view.clockMemberName ?? null),
      });
    }
  };

  return (
    <div className="flex flex-col gap-4" onKeyDown={onPoolKeyDown}>
      {/* No `Correction` here any more. This component does not submit a
          pick since 3.7 — `ConfirmPick` does, in the sticky band, which is
          where the confirming tap is and therefore where a refusal belongs.
          The row still strikes itself in `slot-correction` through the shared
          context, so 3.3's "say it on the row that was tapped" survives the
          move. */}

      {/* Best available from your sheet — the blueprint's "always pinned", and
          what "pinned" turned out to have to mean.
          
          Not `position: sticky`: the room already spends a band on the clock,
          and a second one costs a 390px phone the rows it exists to show.
          
          And not *always drawn*, which is the correction 3.4a's critique
          forced. At rest the pool below is already this list — `selectPool`
          ranks it by the same sheet — so the block was three players restated
          in a second set of rows with a second set of buttons. It is drawn only
          once the pool has been narrowed away from them, which is exactly when
          "best available from my sheet" stops being visible on its own.
          
          The *caption and the way back to the sheet* are unconditional, though,
          for anyone who has one. They used to live inside the rows, so a member
          whose sheet had run out — round nine, the moment the page's own doc
          comment says a sheet earns its keep — lost their only route to it from
          the room.
          
          The rows come from the engine's own `rankForMember` and `isLegalPick`,
          so this list and the pick the sweep would make if the clock ran out
          are the same answer. */}
      {hasSheet ? (
        <div className="flex flex-col gap-1.5">
          {/* `ink-soft`, not `ink-faint`: this was the faintest heading in a
              room where "The radar" and "The board" are `ink-soft`, on the
              block the slice exists for. */}
          <p className="slot-label flex flex-wrap items-end gap-x-2 text-ink-soft">
            <span className="pb-1.5">
              {pinned.length > 0
                ? "Best on your sheet"
                : view.bestFromSheet.length > 0
                  ? "Your sheet is at the top of the pool"
                  : "Nobody left on your sheet fits your roster"}
            </span>
            {/* `min-h-11 items-end` rather than a bare inline link, and for the
                reason DESIGN.md records `FilterToggle` learning it: the 44px
                rule is both axes, and an inline link in a 12px caption is a
                target a thumb misses. The label still sits on the caption's
                own baseline; only the tappable box is 44px. It is the room's
                only way *back* to a sheet for somebody who already has one —
                "editable during the draft" needs a door. */}
            <Link
              href={`/leagues/${leagueId}/sheet`}
              data-testid="edit-sheet"
              className="inline-flex min-h-11 min-w-11 items-end pb-1.5 underline decoration-dotted underline-offset-4 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
            >
              edit it
            </Link>
          </p>
          {pinned.length > 0 ? (
            <Slots
              testId="sheet-pinned"
              label="Best available from your cheat sheet"
            >
              {pinned.map((player) => (
                // `waiting`, like every other *available* player in this room.
                // The default `filled` is a solid rule, and three rows below it
                // the pool uses solid to mean "somebody already owns this" — so
                // the three players you most want were drawn in the material that
                // means gone. It also makes the two runs share a rhythm: 61px
                // each, rather than 69 above 61.
                <Slot
                  key={player.id}
                  testId="sheet-pinned-row"
                  state="waiting"
                  nowrap
                >
                  <span className="flex min-w-0 flex-1 items-baseline gap-x-3 overflow-hidden">
                    <span className="slot-label w-8 shrink-0 text-right tabular-nums text-ink-soft">
                      #{player.rank}
                    </span>
                    <span className="min-w-0 truncate" title={player.name}>
                      <CardName scale="slot">{player.name}</CardName>
                    </span>
                    <span className="slot-label">{player.club}</span>
                    <PositionPatch position={player.position} />
                  </span>
                  {canPick ? (
                    <ChooseButton
                      player={player}
                      isArmed={armedId === player.id}
                      // The same computation the pool row does. It was
                      // hardcoded `null` here, which is the whole finding.
                      forTeamName={
                        view.isYourTurn ? null : (view.clockMemberName ?? null)
                      }
                      arm={arm}
                      testId={`pin-${player.id}`}
                      ariaSuffix={`, number ${player.rank} on your sheet`}
                    />
                  ) : null}
                </Slot>
              ))}
            </Slots>
          ) : null}
        </div>
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
      {/* `sm` and up. Sixty-seven characters of caps telling a phone about
          arrow keys and Escape is noise on the device draft night happens on,
          and it sat between the search box and the first player. The keyboard
          path is still there for anyone with a keyboard; `aria-describedby`
          still points at it, and a screen-reader user on a phone with a
          Bluetooth keyboard is exactly who benefits from it being announced
          rather than drawn. */}
      <p id="pool-keys" className="slot-label hidden text-ink-faint sm:block">
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
        {/* Only offered to somebody who has a sheet. A filter that can only
            ever empty the list is not a control, it is a trap. */}
        {hasSheet ? (
          <FilterToggle
            testId="filter-sheet-only"
            pressed={filters.sheetOnly}
            onPressedChange={(next) => setFilter("sheetOnly", next)}
          >
            On my sheet
          </FilterToggle>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-x-6 gap-y-3">
        <label className="flex min-w-40 flex-1 flex-col gap-1">
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

        {/* 3.3's last deferred filter. It was blocked on there being tiers to
            filter by, and it stays hidden for a sheet that has no breaks in it
            — a "Tier 1" that is the whole sheet filters nothing. */}
        {sheetTiers.length > 1 ? (
          <label className="flex min-w-40 flex-1 flex-col gap-1">
            <span className="slot-label">Tier on my sheet</span>
            <select
              value={String(filters.tier)}
              onChange={(event) =>
                setFilter("tier", Number(event.target.value))
              }
              data-testid="filter-tier"
              className={selectStyles}
            >
              <option value="0">Every tier</option>
              {sheetTiers.map((tier) => (
                <option key={tier} value={String(tier)}>
                  Tier {tier}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

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
      {/* Named, because it is no longer the only polite region on the page:
          3.5 put league chat on the same route, and a bare `getByRole("status")`
          in a spec now matches both. Two independent regions is correct — this
          one reports what the *list* did, chat's reports what the *draft* did —
          but each needs to be addressable on its own. */}
      <p
        role="status"
        aria-live="polite"
        data-testid="pool-said"
        className="sr-only"
      >
        {rows.length === 0
          ? "Nobody left matching that."
          : `${rows.length} ${rows.length === 1 ? "player" : "players"} match.`}
      </p>

      <Slots testId="pick-pool" label="The player pool">
        {shortlist.map((player, position) => {
          const isHighlighted = position === cursor;
          const isArmed = armedId === player.id;
          const isRefused = refused?.playerId === player.id;
          return (
            <Slot
              key={player.id}
              // Four states, and the drafted one is not `waiting`. A dashed
              // rule is this system's word for an empty place; a player
              // somebody already owns is the most settled row in the list.
              // A refused row is struck in ink — `slot-correction` — because
              // that is this system's word for an error, and because the whole
              // argument for muting a row rather than hiding it is that the
              // refusal explains itself *where the tap was*. It was explaining
              // itself above the search box, up to thirty rows away.
              state={
                isRefused
                  ? "correction"
                  : isArmed
                    ? "live"
                    : player.drafted
                      ? "filled"
                      : "waiting"
              }
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
                {/* Where this player sits on *your* sheet — leading, fixed
                    width, right-aligned, so `#1`…`#8` form a column that can be
                    read down. Trailing the position patch, they landed at eight
                    different x-positions, which is the radar critique's fixed
                    finding #4 re-broken 20px away. The column is rendered even
                    when empty so a sheeted and an unsheeted row still align.
                    Only drawn at all when the viewer has a sheet. */}
                {hasSheet ? (
                  <span
                    className="slot-label w-8 shrink-0 text-right tabular-nums text-ink-soft"
                    data-testid="pool-sheet-rank"
                  >
                    {player.sheetRank === null ? "" : `#${player.sheetRank}`}
                  </span>
                ) : null}
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
                {isRefused ? (
                  <span
                    className="slot-label shrink-0 text-ink"
                    data-testid="pool-refused"
                    // **No `role="alert"`.** The band's `Correction` announces
                    // the refusal, and this said the same sentence in the same
                    // render — so a screen reader heard "The draft is paused"
                    // twice, from two polite regions mounting together. 3.3's
                    // fix was that the refusal must be visible *on the row that
                    // was tapped*; that is a visual claim, and the row keeps
                    // it. Saying it once is the whole of the other half.
                  >
                    {refused?.reason}
                  </span>
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
                /* **Arms. Does not pick.** A tap here used to submit
                   immediately, so on the device draft night happens on one tap
                   drafted a player irreversibly — undoable only by a
                   commissioner rollback, which deletes every pick after it too.
                   Blueprint 3.7 calls that "no fat-finger picks on mobile".

                   The confirming tap is in the sticky band, deliberately out of
                   reach of a double-tap: with it on this button, two taps
                   inside 200ms armed and picked. The label says `Choose`
                   because `Pick` would now be a lie. */
                <ChooseButton
                  player={player}
                  isArmed={isArmed}
                  forTeamName={
                    view.isYourTurn ? null : (view.clockMemberName ?? null)
                  }
                  arm={arm}
                  testId={`pick-${player.id}`}
                />
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

      {/* The count, and — next to it — the control that changes it.
          
          "More rows" used to sit in the "Show" filter row, which made it a
          fifth *data* filter beside four that change which players are in the
          set, and wrapped that row to three lines on a phone. It is not a
          whether; it is about the length of the list, so it belongs at the
          bottom of the list, where the truncation is what you are looking at. */}
      <p className="flex flex-wrap items-end justify-between gap-x-4">
        <span
          className="slot-label pb-1.5 text-ink-faint"
          data-testid="pool-count"
        >
          {rows.length > shortlist.length
            ? `Showing ${shortlist.length} of ${rows.length} matches`
            : `${rows.length} ${rows.length === 1 ? "match" : "matches"}`}
        </span>
        {rows.length > RESTING_ROWS ? (
          <FilterToggle
            testId="filter-more-rows"
            pressed={expanded}
            onPressedChange={setExpanded}
          >
            {expanded ? "Fewer rows" : `Show ${EXPANDED_ROWS}`}
          </FilterToggle>
        ) : null}
      </p>
    </div>
  );
}
