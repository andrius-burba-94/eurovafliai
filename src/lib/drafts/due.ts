import type { DraftRecord } from "./types";

/**
 * Has the clock actually run out?
 *
 * The worker's whole authority is this one piece of arithmetic (§4 of the
 * draft-engine invariants: expiry is executed only by the worker, never by a
 * browser), so it lives on its own, pure, with `now` passed in — the same
 * discipline the engine holds itself to. It is not *in* the engine because
 * `deadline` is a database column and a wall clock, and the engine is allowed
 * to know about neither.
 *
 * Nothing here decides *who* picks or *what* they pick. It answers only
 * "should somebody have picked by now".
 */

/**
 * How long past a deadline the worker waits before picking for somebody.
 *
 * Fairness, not correctness: a member who taps their pick as the clock reaches
 * zero is racing the sweep, and the unique index on `(draft, overall_no)`
 * means whoever loses that race is refused cleanly either way. The grace just
 * makes the human the likely winner, because being told "gone" for a pick you
 * made in time is the worst way to lose a turn.
 */
export const AUTOPICK_GRACE_MS = 1_000;

/** The fields this module needs off a draft. Anything more would be borrowed authority. */
type Clocked = Pick<DraftRecord, "status" | "deadline">;

/**
 * PocketBase hands dates back as `2026-09-02 19:04:05.123Z` — a space where
 * ISO 8601 wants a `T`.
 *
 * V8 happens to parse that form anyway, which is exactly why it is normalized
 * here rather than trusted: it is a non-standard leniency, and a draft that
 * autodrafts on one runtime and stalls on another would be a nightmare to
 * diagnose on draft night. An unset date field comes back as `""`, so an
 * unparseable value is a normal state, not an exception — hence `null` rather
 * than a throw.
 */
export function parsePbDate(value: unknown): Date | null {
  if (typeof value !== "string" || value.trim() === "") return null;
  const parsed = new Date(value.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Milliseconds left on the clock — negative once it has run out, `null` when
 * there is no clock to read.
 *
 * The countdown in the draft room renders this against a server-corrected
 * `now`; the worker enforces it. Same number, two very different jobs.
 */
export function millisRemaining(deadline: unknown, now: Date): number | null {
  const at = parsePbDate(deadline);
  return at === null ? null : at.getTime() - now.getTime();
}

/**
 * Should the sweep pick for whoever is on the clock?
 *
 * Only a `live` draft has a running clock. A paused one deliberately has
 * nobody on it — that is what pausing means, and autodrafting through a pause
 * would take the room's own decision away from it.
 */
export function isPickDue(
  draft: Clocked,
  now: Date,
  graceMs: number = AUTOPICK_GRACE_MS,
): boolean {
  if (draft.status !== "live") return false;
  const remaining = millisRemaining(draft.deadline, now);
  // No deadline is not "overdue". A live draft that lost its deadline is a
  // different repair — see `needsDeadline` — and autodrafting into it would
  // fire on every tick for a draft whose clock nobody ever started.
  if (remaining === null) return false;
  return remaining + graceMs <= 0;
}

/**
 * A live draft whose clock is missing, which the sweep restarts.
 *
 * Every path that sets `status: live` sets a deadline with it, so this state
 * only exists when the second of two writes was lost — and its symptom is the
 * cruellest one available: a draft that looks perfectly healthy and never
 * times anybody out. Restarting the clock is idempotent (a draft with a
 * deadline no longer needs one) and it is the same act the commissioner's
 * "resume" performs, so it cannot produce a state the app could not already
 * reach.
 */
export function needsDeadline(draft: Clocked): boolean {
  return draft.status === "live" && parsePbDate(draft.deadline) === null;
}

/**
 * `m:ss` for the room's countdown — floored, and never negative.
 *
 * Floored rather than rounded, because a clock that shows 1 second while 400ms
 * remain is a clock that lies in the direction that costs somebody a pick.
 * Zero is the floor: the sweep has its own grace period and the display has no
 * business showing a negative number to a room that is already waiting.
 */
export function formatRemaining(millis: number): string {
  const seconds = Math.max(0, Math.floor(millis / 1000));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}
