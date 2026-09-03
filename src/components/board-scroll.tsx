"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The board's scrollport — and the whole client half of the draft board.
 *
 * The grid inside it is server-rendered, because whose slot is marked is the
 * engine's answer and invariant §1 gives the browser no vote in it. What a
 * browser does own is two things the server genuinely cannot know:
 *
 * 1. **Where the board is scrolled.** Thirteen rounds by up to twelve members
 *    does not fit a phone, so the board is a horizontally scrolling region
 *    (DESIGN.md's open question 4, settled here: one layout everywhere rather
 *    than a second container width). Somebody arriving mid-draft should be
 *    looking at the pick on the clock.
 * 2. **Whether this viewer was watching when the marker moved.** That is the
 *    signal the second motion event needs; see the note on `rule-advances` in
 *    `globals.css`. A page load is not an advance.
 *
 * It holds no draft state. `markedOverallNo` is a number it compares with the
 * last number it saw and then forgets; it never decides anything from it.
 *
 * ## It is focusable on purpose
 *
 * A scrolling region with no focusable descendant is unreachable by keyboard,
 * and past about five members that is most of the board — WCAG 2.1.1, on the
 * surface this app is named after. Chromium 127+ makes such a region focusable
 * on its own and Firefox and Safari do not, so the first version of this passed
 * by browser grace in one engine and failed in two, wearing a 1px black user-
 * agent focus ring nobody chose. `tabIndex` makes it work everywhere by intent,
 * and the ring is the design system's own: 2px marker at 2px offset.
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

    const marked = container.querySelector<HTMLElement>(
      '[data-board-slot][data-live="true"]',
    );

    // Clear the mark wherever it was last time. React does not manage this
    // attribute — we set it — so nothing else will take it off, and a stale one
    // left on a slot that is no longer marked would fire the moment that slot
    // was marked again for a different reason.
    for (const stale of container.querySelectorAll("[data-advanced]")) {
      if (stale !== marked) stale.removeAttribute("data-advanced");
    }

    // A finished draft has no marked slot, so there is nothing to follow and
    // nothing to strike. The board stays where the viewer left it.
    if (!marked) return;

    // Only an advance through a *live* draft is struck. A rollback lands the
    // draft paused, and a marker that animated onto the slot a draft had just
    // been walked back to would be announcing progress.
    if (advanced && marked.dataset.state === "live") {
      marked.setAttribute("data-advanced", "true");
      // Taken off again when the travel is over, so the pseudo-element hands
      // the rule back to the real border it was standing in for. Without this
      // the overlay stays for as long as the slot is on the clock — which is
      // 1px narrower than the border it replaced, and makes DESIGN.md's "for
      // the duration of the second motion event" untrue. Under reduced motion
      // no animation runs and none ends, so the attribute simply stays and the
      // rule sits at its resting width; the sweep above collects it later.
      marked.addEventListener(
        "animationend",
        () => marked.removeAttribute("data-advanced"),
        { once: true },
      );
    }

    // Follow the clock only when it has left the room. Scrolling on every
    // change meant that studying your own column seven tracks away lasted
    // exactly until somebody picked — up to 155 interruptions in one sitting,
    // for the eleven people who were not about to pick. The one person who
    // needs the board to move is already looking at the slot it would move to.
    const view = container.getBoundingClientRect();
    const slot = marked.getBoundingClientRect();
    const alreadyVisible =
      slot.left >= view.left && slot.right <= view.right;
    if (alreadyVisible) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches;

    // `scrollTo` on the container, never `scrollIntoView` on the slot: the
    // latter scrolls the *page* as well, which on a phone would yank the pool
    // and the pick button out from under whoever was mid-tap.
    container.scrollTo({
      left: Math.max(
        marked.offsetLeft + marked.offsetWidth / 2 - container.clientWidth / 2,
        0,
      ),
      behavior: advanced && !reduced ? "smooth" : "auto",
    });
  }, [markedOverallNo]);

  return (
    <div
      ref={ref}
      data-testid={testId}
      // Focusable, named and described as a region, so a keyboard user can
      // reach columns past the fold and a screen reader is told what it landed
      // in rather than nothing at all.
      tabIndex={0}
      role="region"
      aria-label="The draft board"
      // `relative` so a slot's `offsetLeft` is measured against this box.
      // `overscroll-x-contain` so swiping the board at its end does not walk
      // the browser back a page on a phone.
      className="relative overflow-x-auto overscroll-x-contain focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
    >
      {children}
    </div>
  );
}
