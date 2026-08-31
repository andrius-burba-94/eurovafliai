import { totalPicks } from "./clock";
import { memberAt } from "./order";
import { buildPickOrder } from "./order";
import type { DraftState, EnginePick } from "./types";

/**
 * Undoing the draft back to a chosen pick number.
 *
 * A supported operation rather than a disaster, per PRODUCT.md — which means it
 * has to be exactly right, including across a snake boundary. The engine only
 * *computes* the revert; the action layer performs it, and the write order there
 * matters as much as the maths here.
 *
 * "Rollback to pick 7" means **pick 7 becomes the pick being waited on again**:
 * everything from 7 upward is deleted and the draft re-points at 7. The
 * off-by-one temptation is to keep pick 7 and re-point at 8, which silently
 * refuses the commissioner the one pick they asked to undo.
 */

export type Rollback = {
  /**
   * Pick records to delete, **highest `overall_no` first**.
   *
   * The order is deliberate. PocketBase has no transactions, so a rollback that
   * dies partway through must leave a state the next attempt can finish.
   * Deleting from the top keeps the remaining picks a contiguous 1…n prefix at
   * every intermediate moment, which is the shape everything else in the engine
   * expects. Deleting from the bottom would leave a hole and make
   * `whoIsOnClock` point into the middle of a draft that still has later picks.
   */
  readonly deletePickIds: readonly string[];
  /** What `drafts.current_pick` becomes. */
  readonly currentPick: number;
  /**
   * Always `paused`. A rollback is a commissioner intervention mid-draft and
   * the room needs a beat to see what happened — resuming instantly would put
   * somebody on the clock before they had read the system message.
   */
  readonly status: "paused";
  /** Who is on the clock once the draft resumes. Announced in the system message. */
  readonly memberOnClock: string;
  /** How many picks this discards. Zero is legitimate: see `computeRollback`. */
  readonly discardedCount: number;
};

export type RollbackResult =
  | { readonly ok: true; readonly rollback: Rollback }
  | { readonly ok: false; readonly reason: string };

/**
 * Work out the revert, or refuse with a reason.
 *
 * Refuses a target outside 1…totalPicks. Note it does **not** refuse a target
 * with nothing to delete — rolling back to the pick already on the clock is a
 * no-op that costs nothing, and treating it as an error would make the
 * commissioner's console fail on a double tap.
 */
export function computeRollback(
  draft: DraftState,
  picks: readonly EnginePick[],
  targetPickNo: number,
): RollbackResult {
  const total = totalPicks(draft);

  if (!Number.isInteger(targetPickNo)) {
    return { ok: false, reason: "Pick number must be a whole number." };
  }
  if (targetPickNo < 1) {
    return { ok: false, reason: "The earliest pick you can roll back to is 1." };
  }
  if (targetPickNo > total) {
    return {
      ok: false,
      reason: `This draft only has ${total} picks, so ${targetPickNo} is not one of them.`,
    };
  }

  const doomed = picks
    .filter((pick) => pick.overallNo >= targetPickNo)
    // Highest first — see the note on `deletePickIds`.
    .sort((a, b) => b.overallNo - a.overallNo);

  const sequence = buildPickOrder(draft.format, draft.memberIds, draft.rounds);

  return {
    ok: true,
    rollback: {
      deletePickIds: doomed.map((pick) => pick.id),
      currentPick: targetPickNo,
      status: "paused",
      memberOnClock: memberAt(sequence, targetPickNo),
      discardedCount: doomed.length,
    },
  };
}
