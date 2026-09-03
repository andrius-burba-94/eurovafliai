"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The board's scrollport — and the whole client half of the draft board.
 *
 * The grid inside it is server-rendered, because whose slot is live is the
 * engine's answer and invariant §1 gives the browser no vote in it. What a
 * browser does own is two things the server genuinely cannot know:
 *
 * 1. **Where the board is scrolled.** Thirteen rounds by up to twelve members
 *    does not fit a phone, so the board is a horizontally scrolling region
 *    (DESIGN.md's open question 4, settled here: one layout everywhere rather
 *    than a second container width). Somebody arriving mid-draft should be
 *    looking at the pick on the clock, not at round one.
 * 2. **Whether this viewer was watching when the clock moved.** That is the
 *    signal the second motion event needs; see the note on `rule-advances` in
 *    `globals.css`. A page load is not an advance.
 *
 * It holds no draft state. `markedOverallNo` is a number it compares with the
 * last number it saw and then forgets; it never decides anything from it.
 */
export function BoardScroll({
  markedOverallNo,
  children,
  testId,
}: {
  /**
   * The slot the board marks. Used only to notice that it moved.
   *
   * Not `current_pick`, which is a subtly different number: in §3's repairable
   * state — a pick created without the draft advancing — the marker moves on
   * while `current_pick` stands still. Keyed on that field, this effect would
   * not run, and the mark it had set on the slot that just filled would stay
   * there: two marker rules on one board, one of them on a finished pick, which
   * is the one thing DESIGN.md says the marker may never do.
   */
  markedOverallNo: number | null;
  children: ReactNode;
  testId?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  /** The last marked slot this component saw. `null` until it has seen one. */
  const seen = useRef<number | null>(null);

  useEffect(() => {
    const container = ref.current;
    if (!container) return;

    // Null on the first run, so a fresh page is still: the room is correct on
    // arrival, and animating it would be decoration rather than news.
    const advanced = seen.current !== null && seen.current !== markedOverallNo;
    seen.current = markedOverallNo;

    const live = container.querySelector<HTMLElement>(
      '[data-board-slot][data-live="true"]',
    );

    // Clear the mark wherever it was last time. React does not manage this
    // attribute — we set it — so nothing else will take it off, and a stale one
    // left on a slot that is no longer live would fire the moment that slot
    // went live again for a different reason.
    for (const stale of container.querySelectorAll("[data-advanced]")) {
      if (stale !== live) stale.removeAttribute("data-advanced");
    }

    // A finished draft has no marked slot, so there is nothing to follow and
    // nothing to strike. The board stays where the viewer left it.
    if (!live) return;

    if (advanced) live.setAttribute("data-advanced", "true");

    const reduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // `scrollTo` on the container, never `scrollIntoView` on the slot: the
    // latter scrolls the *page* as well, which on a phone would yank the pool
    // and the pick button out from under whoever was mid-tap.
    container.scrollTo({
      left: Math.max(
        live.offsetLeft + live.offsetWidth / 2 - container.clientWidth / 2,
        0,
      ),
      behavior: advanced && !reduced ? "smooth" : "auto",
    });
  }, [markedOverallNo]);

  return (
    <div
      ref={ref}
      data-testid={testId}
      // `relative` so a slot's `offsetLeft` is measured against this box.
      // `overscroll-x-contain` so swiping the board at its end does not walk
      // the browser back a page on a phone.
      className="relative overflow-x-auto overscroll-x-contain"
    >
      {children}
    </div>
  );
}
