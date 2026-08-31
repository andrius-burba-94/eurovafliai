import type { DraftFormat } from "./types";

/**
 * Order generation — one pure function, per blueprint §5.
 *
 * The draft order is a flat sequence of member ids: `sequence[0]` owns
 * `overall_no` 1. It is generated, never stored per-pick, so a format can be
 * corrected before a draft starts without rewriting rows.
 *
 * Every function here is 1-based on `overall_no` and 1-based on rounds and
 * slots, because that is what the database and the UI both say. The only
 * 0-based thing is the array index, and `memberAt` exists so no caller has to
 * do that subtraction itself.
 */

/**
 * Is this round drafted in reverse?
 *
 * - **linear** — never. Same order every round.
 * - **snake** — every even round. 1→N, N→1, 1→N…
 * - **snake3rr** — third-round reversal: round 3 repeats round 2's direction,
 *   which compensates the last-pick disadvantage. That single extra reversal
 *   inverts the parity of everything after it, so from round 3 onward 3RR is
 *   the *opposite* of plain snake:
 *
 *   | round  | 1 | 2 | 3 | 4 | 5 | 6 |
 *   |--------|---|---|---|---|---|---|
 *   | snake  | → | ← | → | ← | → | ← |
 *   | 3RR    | → | ← | ← | → | ← | → |
 *
 *   Writing this as "reverse on even rounds, except round 3" is the naive
 *   version and it is wrong from round 4 on — it gives round 4 a reversal it
 *   should not have, handing the same member two consecutive advantages.
 */
function isReversed(format: DraftFormat, round: number): boolean {
  if (format === "linear") return false;

  const snakeReversed = round % 2 === 0;
  if (format === "snake") return snakeReversed;

  // snake3rr: rounds 1 and 2 behave like snake; round 3 onward is inverted.
  return round >= 3 ? !snakeReversed : snakeReversed;
}

/**
 * The draft order, flat.
 *
 * `memberIds` is the order *after* the roll (or the commissioner's manual
 * ordering, or last season's reverse standings) — order mode is orthogonal to
 * format, and by the time this is called the mode has already done its job.
 *
 * Throws rather than returning an empty sequence on nonsense input: an empty
 * order would let a draft "start" with nobody able to pick, which is a far
 * worse failure than a loud one at setup time.
 */
export function buildPickOrder(
  format: DraftFormat,
  memberIds: readonly string[],
  rounds: number,
): string[] {
  if (memberIds.length === 0) {
    throw new Error("buildPickOrder: a draft needs at least one member.");
  }
  if (!Number.isInteger(rounds) || rounds < 1) {
    throw new Error(`buildPickOrder: rounds must be a positive integer, got ${rounds}.`);
  }
  if (new Set(memberIds).size !== memberIds.length) {
    // A duplicated member would silently draft twice per round.
    throw new Error("buildPickOrder: memberIds contains a duplicate.");
  }

  const sequence: string[] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const slots = isReversed(format, round) ? [...memberIds].reverse() : memberIds;
    sequence.push(...slots);
  }
  return sequence;
}

/**
 * The member who owns a 1-based `overall_no`.
 *
 * Exists so that `overall_no - 1` is written exactly once in this codebase.
 */
export function memberAt(sequence: readonly string[], overallNo: number): string {
  const member = sequence[overallNo - 1];
  if (member === undefined) {
    throw new Error(
      `memberAt: overall_no ${overallNo} is outside a draft of ${sequence.length} picks.`,
    );
  }
  return member;
}

/**
 * Where a 1-based `overall_no` sits on the board: which round, and which slot
 * within that round.
 *
 * Note `slot` is the position *in the round as drafted*, so in a reversed round
 * slot 1 is the member who drafts first in that round — not `memberIds[0]`.
 * The board renders rounds as rows, which is exactly this.
 */
export function roundAndSlot(
  overallNo: number,
  memberCount: number,
): { round: number; slot: number } {
  if (!Number.isInteger(overallNo) || overallNo < 1) {
    throw new Error(`roundAndSlot: overall_no must be a positive integer, got ${overallNo}.`);
  }
  if (!Number.isInteger(memberCount) || memberCount < 1) {
    throw new Error(`roundAndSlot: memberCount must be a positive integer, got ${memberCount}.`);
  }
  const zeroBased = overallNo - 1;
  return {
    round: Math.floor(zeroBased / memberCount) + 1,
    slot: (zeroBased % memberCount) + 1,
  };
}
