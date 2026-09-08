/**
 * The on-the-clock cue — the decision half, with no browser in it.
 *
 * PRODUCT.md has promised since 2.6 that being on the clock is "announced to
 * assistive tech via a live region, with sound and vibration cues", and none of
 * the three existed. This is the part that decides *whether* to fire; the
 * playing lives in the component, because an `AudioContext` is not a decision.
 *
 * Pure so the one rule that matters is testable without a clock, a phone or a
 * speaker: **a cue fires on the transition into your turn, never on a
 * re-render.** The room re-renders on every SSE event, which is every one of a
 * draft's ~156 picks — and a cue derived from "am I on the clock right now"
 * would fire on all of them. That is the flood 3.3's critique found in the
 * pool's live region, where eleven announcements queued up about players nobody
 * had navigated to.
 */

export type ClockCueInput = {
  /** Is it this viewer's turn, as the server just rendered it? */
  readonly isYourTurn: boolean;
  /** The pick number on the clock, or null when nobody is. */
  readonly overallNo: number | null;
  /**
   * What we last fired for. Null before the first render, so a member who
   * arrives *already* on the clock is told — landing on your own turn is the
   * case that most deserves the cue, not the one to skip.
   */
  readonly lastFiredFor: number | null;
  /** The member's own choice, off until they say otherwise. */
  readonly enabled: boolean;
};

export type ClockCue = {
  /** Play a tone and buzz. False when the member has cues switched off. */
  readonly play: boolean;
  /**
   * Say it. **Always true when the turn changed**, regardless of the toggle:
   * the live region is an accessibility commitment, not a preference. Somebody
   * who has turned the noise off has not asked to stop being told.
   */
  readonly announce: boolean;
  /** The pick this cue is for, to be remembered as `lastFiredFor`. */
  readonly firedFor: number | null;
};

const QUIET: ClockCue = { play: false, announce: false, firedFor: null };

export function clockCue(input: ClockCueInput): ClockCue {
  // Not your turn: nothing to say, and nothing to remember either — so that
  // your *next* turn fires even if it is the same pick number after a rollback
  // walked the board back onto it.
  if (!input.isYourTurn || input.overallNo === null) return QUIET;
  // Already fired for this exact pick. This is the whole flood defence: the
  // room re-renders on every pick in the league and every pause, and each of
  // those re-renders asks this question again.
  if (input.lastFiredFor === input.overallNo) return QUIET;

  return {
    play: input.enabled,
    announce: true,
    firedFor: input.overallNo,
  };
}

/**
 * What the live region says.
 *
 * Names the pick and the round, because the point of saying it out loud is to
 * be useful to somebody who is not looking at the screen — and "you are on the
 * clock" alone leaves them reaching for the board to find out where the draft
 * has got to.
 */
export function clockSentence(overallNo: number, round: number): string {
  return `Your turn. Pick ${overallNo}, round ${round}.`;
}

/**
 * The tone, as numbers.
 *
 * Synthesized rather than an audio asset, which is the same argument DESIGN.md
 * makes for icons being drawn rather than imported: no package, no file, one
 * recipe. Two short notes a fifth apart — enough to be unmistakably deliberate
 * in a room with a television on, short enough not to talk over anybody.
 *
 * Deliberately not a rising alarm. This is a friend group on a couch, and the
 * cue's job is "it is you" rather than "something is wrong".
 */
export const CLOCK_TONE = {
  /** Hz. A fifth apart, in the register a phone speaker actually reproduces. */
  notes: [660, 990],
  /** Seconds per note. */
  noteSeconds: 0.12,
  /** Peak gain. Low: a cue, not an alert. */
  gain: 0.15,
} as const;

/** Milliseconds. Two short buzzes, which reads as a signal rather than a call. */
export const CLOCK_VIBRATION: readonly number[] = [90, 70, 90];

/**
 * The `localStorage` key. **Per device, not per league.**
 *
 * It was per league, justified as "one room may be loud and another quiet" —
 * which sounds reasonable and is wrong for this product. PRODUCT.md describes
 * one friend group with one league; a per-league key means a member sets the
 * preference again in every league they ever join, for a benefit nobody here
 * will ever use. Whether a phone should make a noise depends on the phone and
 * the room it is in, and both are properties of the device.
 */
export const CUE_KEY = "eurovafliai:cues";

/**
 * A stored preference, read back.
 *
 * Anything that is not exactly `"on"` is off, including a value some other
 * version of this app wrote. Defaulting to *off* on an unrecognised value is
 * the safe direction: a phone that unexpectedly stays quiet is a disappointment,
 * one that unexpectedly makes a noise is a problem.
 */
export function cuesEnabled(stored: string | null): boolean {
  return stored === "on";
}
