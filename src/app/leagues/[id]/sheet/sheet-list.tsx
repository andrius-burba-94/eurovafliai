"use client";

import {
  useEffect,
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useSyncExternalStore,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";

import {
  Bank,
  CardName,
  Correction,
  PositionPatch,
  Slot,
  Slots,
} from "@/components/board";
import type { Position } from "@/lib/engine";
import { positionSentence } from "@/lib/positions";
import { editCheatSheet } from "@/lib/sheets/actions";
import { tierOfRank } from "@/lib/sheets/ranking";
import { applyOperation, type SheetOperation } from "@/lib/sheets/reorder";
import type { CheatSheetView, SheetPlayerRow } from "@/lib/sheets/queries";

/**
 * The sheet as it stands — and, since 3.4b, the thing you edit by acting on it.
 *
 * One `Slots` run per tier rather than one run with dividers in it, because
 * that is what a tier *is*: CONTEXT.md calls it "a break in a cheat sheet", and
 * a break between two runs is the board's own way of saying a run has ended.
 * No new material, no coloured band, no chip — the gap and the caption carry it,
 * which is the same argument the radar's groups make.
 *
 * ## Arm, then move
 *
 * Tap a row to **pick it up**; it takes `slot-transit` and the bar below gains
 * every verb. Tap another row to drop it there, or drag the row you are
 * holding. `Escape`, or a second tap on the held row, puts it down.
 *
 * The verbs live in the bar rather than on the rows, and that is a measurement
 * rather than a taste: three controls per row at 44×44 on both axes (DESIGN.md's
 * Do, which 3.3's toggles fell through by being 24px wide) is 132px of controls
 * beside `#N`, a name, a club and a patch — inside 390px. 3.4a already overflowed
 * this surface by 161px once. One row action and a bar with room in it is the
 * same information without the crush.
 *
 * A nudge (`↑`/`↓`) keeps the row in your hand, because you are still adjusting.
 * A *placement* — tapping another row, or a drag — puts it down, because that is
 * what dropping means.
 *
 * ## Why the row must be held before it can be dragged
 *
 * `touch-action: none` is the only thing that stops a browser claiming a
 * touch-drag for itself, and putting it on every row **kills scrolling through
 * the list** — fatal on the phone this app is designed around, with a sheet
 * sixty rows long. Scoped to the one held row, the rest of the list scrolls
 * normally. It also means no drag handle (DESIGN.md bans icon packages, so a
 * grip would have to be a hand-drawn single-stroke SVG) and no hidden
 * long-press contract: the drag is a deliberate second gesture.
 *
 * ## Optimism, and the one function behind it
 *
 * A move is applied twice — here through `useOptimistic` so the row travels
 * under a finger, and again on the server against the sheet as *stored*. Same
 * `applyOperation` both times, so the two cannot disagree; the wire carries the
 * operation rather than the new ranking, so a stale tab cannot overwrite an
 * edit made somewhere else.
 */
const POSITIONS: Position[] = ["G", "F", "C"];

/** The bar's own controls, sized by DESIGN.md's Do: 44px on **both** axes. */
const BAR_BUTTON =
  "slot-label min-h-11 min-w-11 border border-ink/50 px-3 text-ink transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live disabled:opacity-40";

/** For `useSyncExternalStore` as a hydration flag: the store never changes. */
const subscribeToNothing = () => () => {};

export function SheetList({
  leagueId,
  rows,
  tiers,
  poolSize,
  cover,
}: {
  leagueId: string;
  rows: readonly SheetPlayerRow[];
  tiers: readonly number[];
  poolSize: number;
  cover: CheatSheetView["cover"];
}) {
  const [sheet, applyOptimistic] = useOptimistic(
    { ranking: rows.map((row) => row.id), tiers: [...tiers] },
    (state, operation: SheetOperation) => applyOperation(state, operation),
  );
  const [pending, startTransition] = useTransition();
  /** The row in your hand. Null when nothing is picked up. */
  const [heldId, setHeldId] = useState<string | null>(null);
  /** How far the held row has been dragged, and the row it is over. */
  const [drag, setDrag] = useState<{ dy: number; overId: string | null } | null>(
    null,
  );
  /**
   * The one sentence a screen reader gets. This surface had **no live region at
   * all** before 3.4b — a critique P0 — and a reorder is the case that needs one
   * most: rule weight, a wash and an outline are three things a screen reader
   * cannot see (DESIGN.md:724), so a row's new place has to be said in words.
   */
  const [message, setMessage] = useState("");
  /**
   * The last edit that failed, in words, on the surface that caused it.
   *
   * There was no error surface here at all: both call sites did
   * `await editCheatSheet(...)` and dropped the result, so an expired session or
   * a dropped connection moved the row optimistically, reverted it on the next
   * render, and said nothing. Error Recovery scored 0/4.
   */
  const [error, setError] = useState<string | null>(null);
  /**
   * The player just removed, so they can be put back.
   *
   * An undo rather than a confirm, which is the answer to a page that guarded
   * *deleting the whole sheet* behind two presses while a single player went in
   * one tap with no confirmation, no visible acknowledgement and no way back.
   * A confirm would tax the common case to protect the rare one; an undo taxes
   * neither, and closes visibility, control and recovery at once.
   */
  const [undone, setUndone] = useState<{
    playerId: string;
    rank: number;
    name: string;
  } | null>(null);

  const dragFrom = useRef<{ y: number; rank: number } | null>(null);
  /**
   * A drag just ended, so ignore the `click` that follows it.
   *
   * `pointerup` is followed by a `click` on the same element whenever pointer
   * capture kept both events on the row — which is exactly what happens when a
   * drag is released over dead space. The click then ran `onRowActivate` on a
   * row that had just been put down and picked it straight back up, so the next
   * tap moved it somewhere nobody chose. Only reachable on a *failed* drop: a
   * successful one releases over a different row, and the click goes to a
   * common ancestor instead.
   */
  const draggedRef = useRef(false);
  /** A row to put focus on once the list has re-rendered. */
  const focusWanted = useRef<string | null>(null);
  /** The bar, measured, so the list can reserve exactly its height. */
  const barRef = useRef<HTMLDivElement>(null);
  const [barHeight, setBarHeight] = useState(0);
  /**
   * Has this list hydrated? The page streams behind a `loading.tsx`, so the
   * rows are in the HTML — focusable, clickable — before React has attached a
   * single handler to them. A keyboard press in that window does nothing, and
   * a spec that focuses a row and presses Enter was losing exactly that race.
   * Surfaced on `sheet-pending` as `data-ready`, with no appearance: a fact to
   * wait for rather than a duration.
   */
  const ready = useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
  /**
   * The row the pointer is currently over, held in a ref as well as in state.
   *
   * The state copy draws the drop target; **this** copy decides where the row
   * lands, and the two exist separately because `pointerup` can arrive in the
   * same task as the last `pointermove`. React has not re-rendered by then, so
   * a handler reading `drag.overId` out of state sees `null` and the drag
   * silently does nothing. It survived the mouse — Playwright's moves are far
   * enough apart — and died under a finger, which is exactly the asymmetry the
   * touch spec exists to catch.
   */
  const overRef = useRef<string | null>(null);
  const rowRefs = useRef(new Map<string, HTMLElement>());

  const byId = useMemo(
    () => new Map(rows.map((row) => [row.id, row])),
    [rows],
  );

  /**
   * Put focus back on a row after an edit that ended the hold.
   *
   * Measured before this existed: after a drop, a put-down **or a removal**,
   * `document.activeElement` was `<body>` — so anybody on a keyboard or a
   * switch had to Tab from the top of the document to carry on editing. The
   * row is the thing they were working on, so the row is where focus belongs.
   */
  useEffect(() => {
    const id = focusWanted.current;
    if (!id) return;
    focusWanted.current = null;
    rowRefs.current.get(id)?.focus();
  });

  /**
   * The bar's real height, so the list reserves exactly that much and no more.
   *
   * Re-measured whenever what the bar holds changes, because its height does:
   * five buttons wrap to two rows on a phone and sit on one at 1440px, and an
   * error or an undo adds a line.
   */
  useEffect(() => {
    setBarHeight(barRef.current?.offsetHeight ?? 0);
  }, [heldId, undone, error, sheet.ranking.length]);

  /**
   * The optimistic ranking, back in the shape the rows are drawn from.
   *
   * Rank and tier are recomputed here rather than read off the server's rows,
   * because after an optimistic move the server's numbers are one round trip
   * out of date — and the numbers are the whole point of the column.
   */
  const display = useMemo(
    () =>
      sheet.ranking.flatMap((id, index) => {
        const base = byId.get(id);
        if (!base) return [];
        const rank = index + 1;
        return [{ ...base, rank, tier: tierOfRank(rank, sheet.tiers) }];
      }),
    [sheet, byId],
  );

  const total = display.length;
  const held = display.find((row) => row.id === heldId) ?? null;

  if (rows.length === 0) {
    return (
      <Bank label="Your ranking" aside="empty">
        <div className="slot-waiting px-3 py-5">
          <p className="text-sm text-ink-soft">
            You have not ranked anybody yet. Until you do, autodraft has nothing
            of yours to go on and will pick the first legal player it finds —
            which is arbitrary, and identical every time.
          </p>
        </div>
      </Bank>
    );
  }

  /**
   * Run an operation: say what happened, then apply it twice.
   *
   * `keepHold` is the difference between a nudge and a placement. `↑`/`↓` leave
   * the row in your hand because you are still adjusting it; dropping it on a
   * row, or dragging it, puts it down.
   */
  const run = (
    operation: SheetOperation,
    announce: string,
    keepHold: boolean,
    heldOnFail?: string,
  ) => {
    setMessage(announce);
    setError(null);
    if (!keepHold) setHeldId(null);
    startTransition(async () => {
      applyOptimistic(operation);
      const result = await editCheatSheet(leagueId, operation);
      // The result is *read* now. It used to be dropped, which is how a failed
      // edit came to look exactly like a successful one — the optimistic row
      // moved, the next server render put it back, and nothing anywhere said
      // why. On a failure the row goes back into your hand so the gesture can
      // simply be repeated.
      if (result.error) {
        setError(result.error);
        setMessage(result.error);
        if (heldOnFail) setHeldId(heldOnFail);
      }
    });
  };

  /** Where a player would end up, so the announcement can name it. */
  const placeAfter = (operation: SheetOperation, playerId: string) => {
    const next = applyOperation(sheet, operation);
    const index = next.ranking.indexOf(playerId);
    const rank = index + 1;
    return { rank, tier: tierOfRank(rank, next.tiers), size: next.ranking.length };
  };

  /**
   * Put the held row at this rank and let go of it.
   *
   * Always a placement: the only two callers are tapping another row and
   * finishing a drag, and both of those *are* dropping it. A nudge is `nudge`,
   * which keeps hold.
   */
  const moveTo = (rank: number) => {
    if (!held) return;
    const operation: SheetOperation = {
      kind: "move",
      playerId: held.id,
      toRank: rank,
    };
    const at = placeAfter(operation, held.id);
    if (at.rank === held.rank) {
      // Dropped where it already was. Say so rather than announcing a change
      // that did not happen.
      setMessage(`${held.name} is already #${held.rank} of ${total}.`);
      setHeldId(null);
      return;
    }
    focusWanted.current = held.id;
    run(
      operation,
      `${held.name}, number ${at.rank} of ${at.size}, tier ${at.tier}.`,
      false,
      held.id,
    );
  };

  /**
   * `↑` and `↓`, as a *relative* operation.
   *
   * Not `moveTo(rank ± 1)`. That was the first version and it is wrong under a
   * fast thumb: both presses compute the same absolute destination from the
   * rank last rendered, so the second one moves nothing. Relative, the two
   * compose — against the optimistic state here, and against the stored sheet
   * on the server.
   */
  const nudge = (by: number) => {
    if (!held) return;
    const operation: SheetOperation = { kind: "nudge", playerId: held.id, by };
    const at = placeAfter(operation, held.id);
    if (at.rank === held.rank) {
      setMessage(`${held.name} is already #${held.rank} of ${total}.`);
      return;
    }
    run(
      operation,
      `${held.name}, number ${at.rank} of ${at.size}, tier ${at.tier}.`,
      true,
    );
  };

  const pickUp = (row: (typeof display)[number]) => {
    setHeldId(row.id);
    // Bring it out from under the bar.
    //
    // The bar is `sticky bottom-0`, so while the page is scrolled short of the
    // end it paints over whatever is at the foot of the viewport — which, for a
    // row near the bottom of the sheet, is that row. Measured on a Pixel 7: the
    // bar ran 621–839 and the row picked up sat at 625, so the first touch of
    // the drag landed on the bar and the browser answered with
    // `pointercancel`. You could pick a row up and then not move it.
    //
    // Centring it is the fix, with the reserved space below the list making
    // centring reachable for the last row too. Scrolling is not animation —
    // DESIGN.md says so where the board's own auto-scroll is exempted.
    rowRefs.current.get(row.id)?.scrollIntoView({ block: "center" });
    setMessage(
      `${row.name} picked up, number ${row.rank} of ${total}. Move it, or choose a row to drop it on.`,
    );
  };

  const putDown = () => {
    if (held) {
      setMessage(`${held.name} put down at number ${held.rank}.`);
      focusWanted.current = held.id;
    }
    setHeldId(null);
    setDrag(null);
    dragFrom.current = null;
  };

  const onRowActivate = (row: (typeof display)[number]) => {
    // A drag just finished on this row. The browser sends a `click` after
    // `pointerup`, and acting on it picks the row straight back up.
    if (draggedRef.current) {
      draggedRef.current = false;
      return;
    }
    if (!heldId) return pickUp(row);
    if (heldId === row.id) return putDown();
    moveTo(row.rank);
  };

  const removeHeld = () => {
    if (!held) return;
    const gone = { playerId: held.id, rank: held.rank, name: held.name };
    // Focus the row that takes its place, or the one above if it was last, so a
    // keyboard user carries on from where they were rather than from `<body>`.
    const neighbour =
      display[held.rank] ?? display[held.rank - 2] ?? undefined;
    if (neighbour) focusWanted.current = neighbour.id;
    run(
      { kind: "remove", playerId: held.id },
      `${held.name} removed. ${total - 1} ${total - 1 === 1 ? "player" : "players"} still ranked. Put them back with the undo below.`,
      false,
    );
    setUndone(gone);
  };

  /** Put back the player just removed, at the rank they held. */
  const undoRemove = () => {
    if (!undone) return;
    const operation: SheetOperation = {
      kind: "insert",
      playerId: undone.playerId,
      atRank: undone.rank,
    };
    focusWanted.current = undone.playerId;
    run(operation, `${undone.name} put back at number ${undone.rank}.`, false);
    setUndone(null);
  };

  const toggleBreakAtHeld = () => {
    if (!held) return;
    const starts = sheet.tiers.includes(held.rank - 1);
    run(
      { kind: "break", atRank: held.rank },
      starts
        ? `Tier break removed. ${held.name} joins the tier above.`
        : `Tier break added. ${held.name} starts tier ${held.tier + 1}.`,
      true,
    );
  };

  // ── the drag, by hand ────────────────────────────────────────────────────
  //
  // No library, and no auto-scroll — the fiddliest part of hand-rolling this,
  // removed by the interaction rather than by code: tapping another row already
  // covers any distance, so a drag never has to reach past the screen.

  const beginDrag = (event: ReactPointerEvent<HTMLElement>, rank: number) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    dragFrom.current = { y: event.clientY, rank };
    overRef.current = null;
    // Capture so the drag survives the pointer leaving the row it started on —
    // which it does immediately, because the row travels with it. Guarded
    // because a pointer id that is no longer active throws `NotFoundError`, and
    // losing capture degrades the drag rather than breaking it: the handlers
    // are on the held row either way.
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // No capture available. The drag still tracks while the pointer is over
      // the row, which is the common case for a short nudge.
    }
    setDrag({ dy: 0, overId: null });
  };

  const onDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const from = dragFrom.current;
    if (!from || !heldId) return;
    // Rects are read live rather than captured at the start: the held row is
    // the only one with `touch-action: none`, so the page can still scroll
    // under a mouse mid-drag, and a cached rect would then point at the wrong
    // row while looking like it worked.
    //
    // **Nearest midpoint, not containment.** Containment was the first version
    // and it left one dead band per tier boundary: a run of rows is closed by a
    // 34px gap and a 16px caption, and a pointer released in there matched no
    // row at all, so the drag silently did nothing. Measured at 36px on a
    // Pixel 7 — and a tiered sheet is edited *at* its boundaries, so the dead
    // space was exactly where the intention was. Nearest-midpoint has no dead
    // space anywhere by construction, including above the first row and below
    // the last.
    let overId: string | null = null;
    let best = Infinity;
    for (const row of display) {
      // Skip the held row. It travels with the pointer, so its own rect is
      // always the nearest one — hit-testing it would pin the target to where
      // the drag started and the drag would silently do nothing.
      if (row.id === heldId) continue;
      const box = rowRefs.current.get(row.id)?.getBoundingClientRect();
      if (!box) continue;
      const distance = Math.abs(event.clientY - (box.top + box.bottom) / 2);
      if (distance < best) {
        best = distance;
        overId = row.id;
      }
    }
    overRef.current = overId;
    setDrag({ dy: event.clientY - from.y, overId });
  };

  const endDrag = () => {
    // The ref, not the state. See `overRef`.
    const over = overRef.current;
    const moved = dragFrom.current !== null;
    dragFrom.current = null;
    overRef.current = null;
    // Tell the `click` that follows this `pointerup` to stay out of it — and
    // disarm on the next macrotask, because on a *successful* drop the click
    // lands on a common ancestor and never reaches `onRowActivate` to clear the
    // flag itself. Left armed, it would swallow the next honest tap on a row.
    if (moved) {
      draggedRef.current = true;
      setTimeout(() => {
        draggedRef.current = false;
      }, 0);
    }
    setDrag(null);
    if (!over) return putDown();
    const target = display.find((row) => row.id === over);
    if (!target) return putDown();
    moveTo(target.rank);
  };

  const missing = display.filter((row) => row.missing).length;
  // Recounted from the optimistic ranking, not taken from the server's `cover`,
  // so a removal does not leave a header claiming a player it can no longer see.
  const ranked = (position: Position) =>
    display.filter((row) => !row.missing && row.position === position).length;
  const short = POSITIONS.filter(
    (position) => ranked(position) < cover[position].needed,
  );
  const groups = [...new Set(display.map((row) => row.tier))].sort(
    (a, b) => a - b,
  );
  const heldStartsTier = held ? sheet.tiers.includes(held.rank - 1) : false;
  /** The bar is on screen whenever it has something to say or offer. */
  const barOpen = Boolean(held || undone || error);

  return (
    <Bank label="Your ranking" aside={`${total} of ${poolSize} ranked`}>
      {/* A write in flight, as an attribute and nothing else. There is no
          spinner — DESIGN.md rules one out by name — but a spec that reloads
          the page the instant the optimistic row has moved will abort the POST
          it never waited for, and the edit vanishes with no failure anywhere
          near the cause. `data-advanced` on the draft board is the precedent:
          an attribute with no appearance, so a test can wait for a fact
          instead of for a duration. */}
      <span
        data-testid="sheet-pending"
        data-pending={pending ? "true" : "false"}
        data-ready={ready ? "true" : "false"}
        hidden
      />
      {/* One short line. It was 140 permanent characters listing four gestures
          before any of them was possible, and telling a phone to press Escape —
          part of 426px of chrome above rank #1 at 390px, half the viewport. The
          gestures explain themselves once a row is in your hand, and the bar
          says so there; every row also carries its own `sr-only` version. */}
      <p className="max-w-prose text-sm text-ink-soft">
        Tap a player to pick them up.
      </p>

      {missing > 0 ? (
        <p className="text-sm text-ink-soft">
          {missing} {missing === 1 ? "player is" : "players are"} no longer in
          the pool. They are kept in place so the ranking around them does not
          shift; autodraft skips them. Picking one up and removing it is the
          tidiest way out.
        </p>
      ) : null}

      {/* What the sheet is made of, in the app's own position patches — the
          same three marks the radar and the room's "you still need" use, so
          the comparison is a glance rather than arithmetic. */}
      <p className="flex flex-wrap items-center gap-2">
        <span className="slot-label">Ranked</span>
        {POSITIONS.map((position) => (
          <PositionPatch
            key={position}
            position={position}
            count={ranked(position)}
          />
        ))}
      </p>
      {short.length > 0 ? (
        <p
          className="max-w-prose text-sm text-ink-soft"
          data-testid="sheet-short"
        >
          You have ranked{" "}
          {/* `keepZeros`, and it is the whole point of the sentence. Without
              it this read "You have ranked 4 guards and 1 center, and a full
              roster needs 5 guards, 5 forwards and 3 centers" — dropping the
              one position the member had *none* of, which is the one that
              strands autodraft. */}
          {positionSentence(
            Object.fromEntries(
              short.map((position) => [position, ranked(position)]),
            ),
            "none of them",
            { keepZeros: true },
          )}
          , and a full roster needs{" "}
          {positionSentence(
            Object.fromEntries(
              short.map((position) => [position, cover[position].needed]),
            ),
          )}
          . Autodraft can only pick from what you have ranked; below that it
          falls back to an arbitrary legal player.
        </p>
      ) : null}

      <div
        // The bar is a *visible affordance*, not the only route to these
        // verbs. Measured before this: from a held row, `↑ Up` was **12 Tab
        // presses** away, because the bar follows every row in DOM order — so
        // the fastest keyboard path to "move this up one" was to leave the row,
        // walk the rest of the list, and come back.
        onKeyDown={(event) => {
          if (!heldId) return;
          if (event.key === "Escape") {
            event.preventDefault();
            putDown();
          } else if (event.key === "ArrowUp") {
            event.preventDefault();
            nudge(-1);
          } else if (event.key === "ArrowDown") {
            event.preventDefault();
            nudge(1);
          } else if (event.key === "Delete" || event.key === "Backspace") {
            event.preventDefault();
            removeHeld();
          }
        }}
        // Room for the bar while one is held, so every row — including the
        // last — can be scrolled clear of it. Without this the foot of the
        // sheet is permanently under the controls.
        //
        // Measured from the bar rather than guessed. It was a fixed `pb-48`
        // (192px) against a bar that is 166px on a phone and 98px on a desktop,
        // which left a 205px dead gap below the last held row at both sizes —
        // bracketed by two identical dashed rules, so it read as a rendering
        // fault rather than as breathing room.
        data-testid="sheet-list"
        className="flex flex-col gap-3"
        style={{ paddingBottom: barHeight ? barHeight + 12 : undefined }}
      >
        {groups.map((tier) => (
          <div key={tier} className="flex flex-col gap-1.5">
            {/* Only worth naming when there is more than one. A sheet with no
                breaks should not grow a heading that says "Tier 1" over the
                whole of it. */}
            {groups.length > 1 ? (
              <p className="slot-label text-ink-faint">Tier {tier}</p>
            ) : null}
            <Slots testId={`sheet-tier-${tier}`} label={`Tier ${tier}`}>
              {display
                .filter((row) => row.tier === tier)
                .map((row) => {
                  const isHeld = row.id === heldId;
                  const dragging = isHeld && drag !== null;
                  return (
                    <Slot
                      key={row.id}
                      testId="sheet-row"
                      // Held beats missing: which row is in your hand is the
                      // more urgent of the two facts, and the faint text below
                      // still says the player has left the pool.
                      //
                      // While it is actually *travelling*, the `<li>` stops
                      // carrying the material and becomes `waiting` — an empty
                      // place, which is precisely what it now is. The transit
                      // rule moves onto the content, below. Measured before
                      // this: `<li>` at y=393 with the 2px dashed rule, content
                      // at y=635 with none — 242px apart, so the rule marked a
                      // hole and the row in your hand had no material at all.
                      state={
                        dragging
                          ? "waiting"
                          : isHeld
                            ? "transit"
                            : row.missing
                              ? "waiting"
                              : "filled"
                      }
                      current={drag?.overId === row.id}
                      nowrap
                      className={[
                        row.missing ? "text-ink-faint" : "",
                        isHeld ? "touch-none" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      <button
                        type="button"
                        ref={(element) => {
                          if (element) rowRefs.current.set(row.id, element);
                          else rowRefs.current.delete(row.id);
                        }}
                        data-testid="sheet-row-grab"
                        data-player={row.id}
                        data-rank={row.rank}
                        data-held={isHeld ? "true" : undefined}
                        aria-pressed={isHeld}
                        onClick={() => onRowActivate(row)}
                        onPointerDown={
                          isHeld ? (event) => beginDrag(event, row.rank) : undefined
                        }
                        onPointerMove={isHeld ? onDragMove : undefined}
                        onPointerUp={isHeld ? endDrag : undefined}
                        onPointerCancel={isHeld ? endDrag : undefined}
                        // The whole row is the hit area — DESIGN.md's own habit
                        // for a row-sized target, stretched into the slot's
                        // padding with matching negative margins.
                        className={`-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 items-baseline gap-x-3 overflow-hidden px-3 py-3 text-left transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live ${
                          dragging
                            ? // The material travels with the content, and the
                              // content gets a ground. Without the ground two
                              // names printed on top of each other: the
                              // travelling row overlapped its neighbour by 23px
                              // in the same column, measured mid-drag.
                              "slot-transit bg-stock"
                            : "hover:bg-ink/5"
                        }`}
                        style={
                          dragging
                            ? {
                                // A transform driven straight from the pointer.
                                // No keyframes and no transition, so the two-event
                                // motion budget stays spent — see DESIGN.md's
                                // motion rules, which now say so out loud.
                                transform: `translateY(${drag.dy}px)`,
                                position: "relative",
                                // Above every other row, so the row in your
                                // hand is legibly on top of the list rather
                                // than tangled in it.
                                zIndex: 20,
                              }
                            : undefined
                        }
                      >
                        {/* `#N`, right-aligned in a fixed column — one rank
                            format in the app, not three. */}
                        <span className="slot-label w-8 shrink-0 text-right tabular-nums text-ink-soft">
                          #{row.rank}
                        </span>
                        {/* `flex-1` on the name, `shrink-0` on what follows:
                            the name takes the slack so the club and the patch
                            land at the same x down the whole column. Measured
                            without it — uniform at 358 on a phone, where names
                            truncate, but ragged across ten values from 764 to
                            778 at 1440px, where they do not. The pool's rows
                            were corrected for exactly this. */}
                        <span
                          className="min-w-0 flex-1 truncate"
                          title={row.name}
                        >
                          <CardName scale="slot">{row.name}</CardName>
                        </span>
                        {row.club ? (
                          <span className="slot-label shrink-0">
                            {row.club}
                          </span>
                        ) : null}
                        {row.missing ? null : (
                          <span className="shrink-0">
                            <PositionPatch position={row.position} />
                          </span>
                        )}
                        <span className="sr-only">
                          {isHeld
                            ? "picked up. Activate to put down."
                            : heldId
                              ? "Activate to drop the held player here."
                              : "Activate to pick up."}
                        </span>
                      </button>
                    </Slot>
                  );
                })}
            </Slots>
          </div>
        ))}
      </div>

      {/* The verbs, where the thumb is.
          
          `sticky bottom-0` rather than `fixed`: it follows you down a long sheet
          and then rests at its natural place at the end of the list, so it
          cannot cover the last row — which a fixed bar would, and which would
          need a global padding hack to undo. */}
      {barOpen ? (
        <div
          ref={barRef}
          data-testid="sheet-bar"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              putDown();
            }
          }}
          className="slot-transit sticky bottom-0 z-30 flex flex-col gap-3 bg-stock px-3 pb-3 pt-3"
        >
          {/* A failed edit says so where it happened. */}
          {error ? (
            <Correction testId="sheet-edit-error">{error}</Correction>
          ) : null}

          {/* Not `slot-label`. That is 11px uppercase at 0.14em tracking —
              right for "L3" or a column head, wrong for a 49-character
              sentence, which the in-page detector flagged as `all-caps-body`
              and which wrapped to two shouting lines on a phone. The *name*
              stays in the board's caps, because that is how this system writes
              a player's name; the sentence around it is a sentence. */}
          {held ? (
            <p className="text-sm text-ink-soft" data-testid="sheet-bar-held">
              <CardName scale="slot">{held.name}</CardName> in hand &middot;{" "}
              <span className="tabular-nums">
                #{held.rank} of {total}
              </span>
            </p>
          ) : null}

          {/* The undo. It is the whole answer to a one-tap removal: no confirm
              to pay on every removal, and a way back from the one that was a
              mistake. */}
          {undone && !held ? (
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-sm text-ink-soft">
                Removed <CardName scale="slot">{undone.name}</CardName>.
              </p>
              <button
                type="button"
                data-testid="sheet-undo"
                onClick={undoRemove}
                className={BAR_BUTTON}
              >
                Put them back
              </button>
              <button
                type="button"
                data-testid="sheet-undo-dismiss"
                onClick={() => {
                  setUndone(null);
                  setError(null);
                }}
                className={BAR_BUTTON}
              >
                Done
              </button>
            </div>
          ) : null}

          {held ? (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="sheet-up"
              disabled={held.rank === 1}
              onClick={() => nudge(-1)}
              className={BAR_BUTTON}
            >
              &uarr; Up
            </button>
            <button
              type="button"
              data-testid="sheet-down"
              disabled={held.rank === total}
              onClick={() => nudge(1)}
              className={BAR_BUTTON}
            >
              &darr; Down
            </button>
            <button
              type="button"
              data-testid="sheet-break"
              // Rank 1 cannot start a tier: a break before the first player
              // describes nothing, and `asBreaks` rejects it on the way out of
              // the database too.
              disabled={held.rank === 1}
              onClick={toggleBreakAtHeld}
              className={BAR_BUTTON}
            >
              {heldStartsTier ? "Merge up" : "New tier"}
            </button>
            <button
              type="button"
              data-testid="sheet-putdown"
              onClick={putDown}
              className={BAR_BUTTON}
            >
              Put down
            </button>
            {/* Last, and struck in ink at 2px — this system's declared material
                for a control that wants looking at twice. It used to sit
                directly under `↑ Up`: same x column, 52px apart, byte-identical
                border and type, and no confirmation, because 407px of buttons
                wrap inside a 350px bar. Separating them and giving this one its
                own material is the cheap half of the fix; the undo above is the
                real one. */}
            <button
              type="button"
              data-testid="sheet-remove"
              onClick={removeHeld}
              className="slot-correction slot-label min-h-11 min-w-11 border-x border-b border-ink/50 px-3 text-ink transition-colors hover:border-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
            >
              Remove
            </button>
          </div>
          ) : null}
          {/* No hint sentence here, deliberately. It read "Or drop X on another
              row — tap it, or drag this one", and with five buttons wrapping on
              a 372px phone it took the bar to **218px** — a quarter of the
              viewport, over the list it exists to edit. The instruction is
              already above the list, and every row carries its own `sr-only`
              version of it. */}
        </div>
      ) : null}

      {/* Polite, and it reports the one thing that changed. 3.3's critique found
          the pool's live region narrating a rebuilt row on every keystroke and
          every pick in the league; the fix there and the shape here are the
          same. It fires on a drop rather than during a drag: somebody dragging
          can see the row move, and mid-drag narration is that flood again. */}
      <p role="status" aria-live="polite" className="sr-only" data-testid="sheet-say">
        {message}
      </p>
    </Bank>
  );
}
