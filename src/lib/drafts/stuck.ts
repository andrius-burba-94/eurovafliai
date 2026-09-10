/**
 * Sentences for a draft the worker cannot advance.
 *
 * Whole sentences ending in a full stop, matching `src/lib/chat/messages.ts`.
 * The reason *code* is what is stored on the draft; the sentence is what a
 * commissioner reads. Keeping them apart means a wording change does not look
 * like a new stuck state to the write-only-on-change guard in the sweep.
 */

export const STUCK_REASONS = [
  "no_legal_player",
  "board_hole",
  "repeated_failure",
] as const;

export type StuckReason = (typeof STUCK_REASONS)[number];

export function isStuckReason(value: string): value is StuckReason {
  return (STUCK_REASONS as readonly string[]).includes(value);
}

/**
 * One sentence a commissioner can act on. Names the pick when we know it, and
 * always says what to do next — the banner is useless if it only says "stuck".
 */
export function stuckSentence(input: {
  readonly reason: StuckReason;
  readonly pickNo?: number;
}): string {
  switch (input.reason) {
    case "no_legal_player": {
      const at =
        input.pickNo !== undefined ? ` at pick ${input.pickNo}` : "";
      return `The draft is stuck${at}: no legal player is left in the pool. Pause, fix the pool or the roster template, then resume.`;
    }
    case "board_hole":
      return "The draft is stuck: there is a gap in the board and nobody is on the clock. Pause, repair the picks, then resume.";
    case "repeated_failure":
      return "The draft is stuck: the worker failed on this draft several times in a row. Check the worker logs, then pause and resume once it is fixed.";
  }
}
