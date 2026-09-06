"use client";

import {
  useMemo,
  useOptimistic,
  useRef,
  useState,
  useTransition,
  type PointerEvent as ReactPointerEvent,
} from "react";

import { Bank, CardName, PositionPatch, Slot, Slots } from "@/components/board";
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

  const dragFrom = useRef<{ y: number; rank: number } | null>(null);
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
  ) => {
    setMessage(announce);
    if (!keepHold) setHeldId(null);
    startTransition(async () => {
      applyOptimistic(operation);
      await editCheatSheet(leagueId, operation);
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
    run(
      operation,
      `${held.name}, number ${at.rank} of ${at.size}, tier ${at.tier}.`,
      false,
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
    setMessage(
      `${held.name}, number ${at.rank} of ${at.size}, tier ${at.tier}.`,
    );
    startTransition(async () => {
      applyOptimistic(operation);
      await editCheatSheet(leagueId, operation);
    });
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
    if (held) setMessage(`${held.name} put down at number ${held.rank}.`);
    setHeldId(null);
    setDrag(null);
    dragFrom.current = null;
  };

  const onRowActivate = (row: (typeof display)[number]) => {
    if (!heldId) return pickUp(row);
    if (heldId === row.id) return putDown();
    moveTo(row.rank);
  };

  const removeHeld = () => {
    if (!held) return;
    run(
      { kind: "remove", playerId: held.id },
      `${held.name} removed. ${total - 1} ${total - 1 === 1 ? "player" : "players"} still ranked.`,
      false,
    );
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
    let overId: string | null = null;
    for (const row of display) {
      // Skip the held row. It is translated to follow the pointer, so its own
      // rect is always under the pointer — hit-testing it would pin the target
      // to where the drag started and the drag would silently do nothing.
      if (row.id === heldId) continue;
      const box = rowRefs.current.get(row.id)?.getBoundingClientRect();
      if (box && event.clientY >= box.top && event.clientY <= box.bottom) {
        overId = row.id;
        break;
      }
    }
    overRef.current = overId;
    setDrag({ dy: event.clientY - from.y, overId });
  };

  const endDrag = () => {
    // The ref, not the state. See `overRef`.
    const over = overRef.current;
    dragFrom.current = null;
    overRef.current = null;
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
        hidden
      />
      <p className="max-w-prose text-sm text-ink-soft">
        Tap a player to pick them up, then move them with the controls below,
        drop them on another row, or drag them. Press <kbd>Escape</kbd> to put
        them down.
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
          {positionSentence(
            Object.fromEntries(short.map((position) => [position, ranked(position)])),
            "none of them",
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
        onKeyDown={(event) => {
          if (event.key === "Escape" && heldId) {
            event.preventDefault();
            putDown();
          }
        }}
        // Room for the bar while one is held, so every row — including the
        // last — can be scrolled clear of it. Without this the foot of the
        // sheet is permanently under the controls.
        className={`flex flex-col gap-3 ${heldId ? "pb-48" : ""}`}
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
                      state={
                        isHeld ? "transit" : row.missing ? "waiting" : "filled"
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
                        className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 items-baseline gap-x-3 overflow-hidden px-3 py-3 text-left transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
                        style={
                          dragging
                            ? {
                                // A transform driven straight from the pointer.
                                // No keyframes and no transition, so the two-event
                                // motion budget stays spent — see DESIGN.md's
                                // motion rules, which now say so out loud.
                                transform: `translateY(${drag.dy}px)`,
                                position: "relative",
                                zIndex: 1,
                              }
                            : undefined
                        }
                      >
                        {/* `#N`, right-aligned in a fixed column — one rank
                            format in the app, not three. */}
                        <span className="slot-label w-8 shrink-0 text-right tabular-nums text-ink-soft">
                          #{row.rank}
                        </span>
                        <span className="min-w-0 truncate" title={row.name}>
                          <CardName scale="slot">{row.name}</CardName>
                        </span>
                        {row.club ? (
                          <span className="slot-label">{row.club}</span>
                        ) : null}
                        {row.missing ? null : (
                          <PositionPatch position={row.position} />
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
      {held ? (
        <div
          data-testid="sheet-bar"
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              event.preventDefault();
              putDown();
            }
          }}
          className="slot-transit sticky bottom-0 z-10 flex flex-col gap-3 bg-stock px-3 pb-3 pt-3"
        >
          <p className="slot-label" data-testid="sheet-bar-held">
            {held.name} picked up &middot; #{held.rank} of {total}
          </p>
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
              data-testid="sheet-remove"
              onClick={removeHeld}
              className={BAR_BUTTON}
            >
              Remove
            </button>
            <button
              type="button"
              data-testid="sheet-putdown"
              onClick={putDown}
              className={BAR_BUTTON}
            >
              Put down
            </button>
          </div>
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
