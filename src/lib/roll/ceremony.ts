/**
 * The roll ceremony — where the draft order is drawn in front of the league.
 *
 * Pure, and time is an argument. This module decides *what the room is looking
 * at* at a given instant: counting down, watching a slot land, or reading a
 * finished order. It owns no rendering and touches no PocketBase.
 *
 * ## Why it is computed from a stored instant rather than driven by a timer
 *
 * The ceremony is one shared moment on a dozen phones (PRODUCT.md principle 3),
 * and the server is the referee (principle 1). A client-side `setTimeout` chain
 * started "when the roll arrived" would drift per device: a phone that was
 * asleep, on a slow network, or opened thirty seconds late would run its own
 * private ceremony, and two friends on one couch would see different slots land.
 *
 * So the first roll stores `rolled_at` and every device *derives* its phase from
 * it. The consequences are all the ones worth having:
 *
 * - A member who opens the page mid-ceremony **joins it in progress**, at the
 *   right slot, rather than starting from ten.
 * - Somebody who arrives after it ended reads the finished order, and is not
 *   shown a countdown for an event that is over.
 * - A reload does not restart anything.
 * - It is **testable without waiting 46 seconds**: backdate `rolled_at` and the
 *   page is already at the instant you want to assert.
 *
 * The caller is expected to pass a `now` corrected against the server's clock,
 * not the device's — see the ceremony component. A device whose clock is wrong
 * by a minute must not get a wrong ceremony, which is the same reason the draft
 * room never trusts a client clock for a pick deadline.
 */

/** Ten seconds of nothing but the number, so the room stops talking. */
export const COUNTDOWN_MS = 10_000;

/**
 * One slot every three seconds.
 *
 * Long enough to say a name out loud and react to it, which is the entire
 * point; a faster reveal is a list appearing, and the app already had one of
 * those.
 */
export const STEP_MS = 3_000;

export type RollPhaseKind = "none" | "countdown" | "revealing" | "complete";

export type RollCeremony = {
  readonly phase: RollPhaseKind;
  /**
   * Whole seconds still to wait, 10 down to 1. Zero outside the countdown.
   *
   * Rounded *up*, so the last visible number is 1 rather than 0: a countdown
   * that shows 0 while nothing has happened yet reads as a stuck clock.
   */
  readonly secondsLeft: number;
  /** How many slots have been drawn, counting from the last one. */
  readonly revealedCount: number;
  /**
   * The draft position drawn most recently, or 0 before any.
   *
   * This is what the announcer says. It walks *down* — the last slot first,
   * first pick last — because a draw that gave away the first pick in its
   * opening half-second would have no reason to take its time.
   */
  readonly landed: number;
  /**
   * True while the ceremony is still running.
   *
   * The lobby reads this to decide whether to bring a member in: during, yes —
   * this is the one moment the app pulls somebody to another page. Afterwards
   * never, or a member who came back for the standings would be dragged into a
   * ceremony they already watched.
   */
  readonly live: boolean;
};

const NONE: RollCeremony = {
  phase: "none",
  secondsLeft: 0,
  revealedCount: 0,
  landed: 0,
  live: false,
};

/**
 * Is this draft position drawn yet, given how many slots have landed?
 *
 * Exported because both the ordered list and the announcer ask it, and asking
 * it two different ways is how they would come to disagree.
 */
export function isDrawn(
  position: number,
  { slots, revealedCount }: { slots: number; revealedCount: number },
): boolean {
  return position > slots - revealedCount;
}

export function rollCeremony({
  rolledAt,
  now,
  slots,
}: {
  /** When the order was first rolled, in ms since the epoch. 0 or null: never. */
  rolledAt: number | null;
  /** Now, corrected against the server's clock, in ms since the epoch. */
  now: number;
  /** How many members have a draft position. */
  slots: number;
}): RollCeremony {
  if (!rolledAt || slots <= 0) return NONE;

  // A device whose clock runs behind the server's would compute a negative
  // elapsed and, without this, skip straight past the countdown into a
  // negative slot index. Clamped to the start: the worst case is that one phone
  // begins the ceremony a moment late, which is recoverable, rather than
  // rendering a slot that does not exist.
  const elapsed = Math.max(now - rolledAt, 0);

  if (elapsed < COUNTDOWN_MS) {
    return {
      phase: "countdown",
      secondsLeft: Math.max(Math.ceil((COUNTDOWN_MS - elapsed) / 1000), 1),
      revealedCount: 0,
      landed: 0,
      live: true,
    };
  }

  const intoReveal = elapsed - COUNTDOWN_MS;
  // `+ 1` because the first slot lands *at* the moment the countdown ends
  // rather than three seconds after it. The step is how long a slot is the
  // newest one, not how long it waits to appear.
  const step = Math.floor(intoReveal / STEP_MS) + 1;

  if (step > slots) {
    return {
      phase: "complete",
      secondsLeft: 0,
      revealedCount: slots,
      landed: 1,
      live: false,
    };
  }

  return {
    phase: "revealing",
    secondsLeft: 0,
    revealedCount: step,
    landed: slots - step + 1,
    live: true,
  };
}

/** How long the whole ceremony takes for a league of this size. */
export function ceremonyDurationMs(slots: number): number {
  return slots <= 0 ? 0 : COUNTDOWN_MS + slots * STEP_MS;
}
