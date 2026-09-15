/**
 * When the clock ran out and nothing took the pick.
 *
 * ## The one failure the stuck banner cannot report
 *
 * 8.2 gave the room a stuck banner, and every `stuck_reason` it renders —
 * `no_legal_player`, `board_hole`, `repeated_failure` — is **written by the
 * worker**. So the state the banner can never describe is the worker's own
 * absence: no process, no write, no banner. The draft simply waits, which is
 * the failure the invariants deliberately chose (§7, degrade never corrupt),
 * and the room says nothing about it.
 *
 * That gap was reported from a real draft night. Autodraft was armed on all
 * three members, the clock ran to zero, and not one of the 39 picks was ever
 * taken by the engine — every one was made by hand, because `npm run dev` does
 * not start the worker and `npm run worker:dev` had not been run. The room's
 * own promise, "the engine picks the moment your turn comes", was false for
 * ninety minutes and nothing on screen admitted it.
 *
 * So this is detected **client-side, from the deadline the server wrote**,
 * precisely because it cannot depend on the worker being alive to report it.
 * The room already asks the server for the page a few times past zero and then
 * gives up; spending those without the pick moving is the signal.
 *
 * It states a symptom and offers the two ways out. It does **not** assert a
 * cause: a slow box, a paused worker and a crashed worker are indistinguishable
 * from the browser, and a notice that named the wrong one would send somebody
 * to fix a thing that was not broken.
 */

export function pickHasStalled({
  remainingMs,
  pullsSpent,
  maxPulls,
}: {
  /** Milliseconds left on the deadline; negative past it, null before it loads. */
  remainingMs: number | null;
  /** How many times the room has asked the server for this same deadline. */
  pullsSpent: number;
  /** How many it is allowed. */
  maxPulls: number;
}): boolean {
  // Null is "not read yet", never "stalled": the first paint has no countdown,
  // and a notice on the first frame of every turn would be the room crying wolf
  // 156 times a night.
  if (remainingMs === null) return false;
  if (remainingMs > 0) return false;
  return pullsSpent >= maxPulls;
}

/**
 * What the room says about it.
 *
 * One sentence of symptom, then the two things that actually move the draft on.
 * Deliberately not "the worker is down" — see the module note.
 */
export const STALLED_SENTENCE =
  "The clock ran out and no pick has landed. Nothing is enforcing the deadline: the pick timer may not be running. Pick by hand to move on, or start the worker.";
