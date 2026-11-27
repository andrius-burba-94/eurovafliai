import { buildPickOrder } from "./order";

import type { DraftFormat } from "./types";

/**
 * The board's shape — rounds down, members across.
 *
 * This is the layout half of `order.ts`. `buildPickOrder` answers "who owns
 * overall number 23"; this answers "where does 23 sit on a wall thirteen rows
 * deep", which is the question a draft board asks and the room could not
 * previously put on screen.
 *
 * ## Why a column is a member and not a slot
 *
 * `roundAndSlot` reports the slot *as drafted*, so in a reversed round slot 1
 * is whoever picks first in that round rather than `memberIds[0]`. That is the
 * right answer for the clock and the wrong one for a wall: a column has to be
 * one member's roster, readable top to bottom, or a snake draft makes every
 * column a zigzag of three different people's players. So the columns here are
 * the member order — round 1's order, the order the roll produced — and it is
 * the pick *numbers* that zigzag, exactly as they do on a real board.
 *
 * ## Why it is computed from `buildPickOrder` rather than beside it
 *
 * The direction of a round is decided in exactly one place: `isReversed`,
 * private to `order.ts`. This module could read the format and reason about
 * parity itself — and then a fourth format, or a correction to 3RR's parity,
 * would have to be made twice, with a silently wrong board as the reward for
 * missing one. Instead the sequence is generated and read: for round `r`, the
 * members in that round's drafted order are `sequence[(r-1)*n … r*n)`, and a
 * member's position in that slice is their slot. Quadratic in member count and
 * that is fine — twelve members, thirteen rounds, 1,872 comparisons once per
 * render. The property bought with it is that this board is right for every
 * format `buildPickOrder` is right for, including formats not written yet.
 */

/** One place on the board: which pick number, in which round, whose column. */
export type BoardSlot = {
  /** 1-based `overall_no` — the pick that fills this place. */
  readonly overallNo: number;
  /** 1-based round, which is the row. */
  readonly round: number;
  /** 1-based position within the round *as drafted* — 1 picks first. */
  readonly slot: number;
  readonly memberId: string;
};

export type BoardShape = {
  /** The columns, left to right: the member order, so column 0 drafts first. */
  readonly columns: readonly string[];
  /** `rows[round - 1][column]`. Every row has one place per column. */
  readonly rows: readonly (readonly BoardSlot[])[];
};

/**
 * Lay out the whole board.
 *
 * Validation is `buildPickOrder`'s — an empty order, a duplicated member or a
 * nonsense round count throw there, with the message that function already
 * words. Repeating the checks here would be a second opinion to keep in sync.
 */
export function buildBoardShape(
  format: DraftFormat,
  memberIds: readonly string[],
  rounds: number,
): BoardShape {
  const sequence = buildPickOrder(format, memberIds, rounds);
  const perRound = memberIds.length;

  const rows: BoardSlot[][] = [];
  for (let round = 1; round <= rounds; round += 1) {
    const start = (round - 1) * perRound;
    const drafted = sequence.slice(start, start + perRound);
    rows.push(
      memberIds.map((memberId) => {
        const slot = drafted.indexOf(memberId) + 1;
        return { overallNo: start + slot, round, slot, memberId };
      }),
    );
  }

  return { columns: [...memberIds], rows };
}
