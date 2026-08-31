import { buildPickOrder, memberAt, roundAndSlot } from "./order";
import type { DraftState, EnginePick } from "./types";

/**
 * Whose turn is it — and the one case where `drafts.current_pick` cannot simply
 * be believed.
 *
 * §1 of the invariants makes the `drafts` record the single authority, and it
 * is. But §3 fixes the write order as *create the pick, then advance the
 * draft*, precisely so that a crash between those two writes leaves a
 * detectable state rather than a lost pick. In that state `current_pick` points
 * at a number that already has a pick against it.
 *
 * So the honest reading of "who is on the clock" is: the first overall number
 * with no pick against it, at or after `current_pick`. That is what these
 * functions compute. Believing `current_pick` blindly would put the same member
 * back on the clock for a pick they have already made, and the UI would offer
 * them a second one.
 *
 * Nothing here reads a clock. Deadline *enforcement* is the worker's job
 * (§4) and takes `now` as an argument at that layer; this module only answers
 * whose turn it is.
 */

export type OnClock = {
  /** 1-based `overall_no` of the pick being waited on. */
  readonly overallNo: number;
  readonly memberId: string;
  readonly round: number;
  /** Position within the round as drafted — in a reversed round, slot 1 drafts first. */
  readonly slot: number;
};

/** Total picks in a complete draft. */
export function totalPicks(draft: Pick<DraftState, "memberIds" | "rounds">): number {
  return draft.memberIds.length * draft.rounds;
}

/**
 * The highest `overall_no` that already has a pick, or 0 for a fresh draft.
 *
 * Derived from the picks rather than from their count: a rollback deletes from
 * the top, and a repair may leave a gap, so `picks.length` is not the same
 * thing as "how far the draft has got".
 */
function highestPickedOverallNo(picks: readonly EnginePick[]): number {
  let highest = 0;
  for (const pick of picks) {
    if (pick.overallNo > highest) highest = pick.overallNo;
  }
  return highest;
}

/**
 * The pick that exists but was never advanced past — §3's repairable state.
 *
 * Returns null when there is nothing to repair, which is the overwhelmingly
 * common case. Both `makePick` and the worker call this on sight; the repair it
 * implies (set `current_pick` to `nextCurrentPick`) is idempotent, because
 * running it again finds nothing.
 */
export function findUnadvancedPick(
  draft: DraftState,
  picks: readonly EnginePick[],
): { readonly pick: EnginePick; readonly nextCurrentPick: number } | null {
  const atCurrent = picks.find((pick) => pick.overallNo === draft.currentPick);
  if (!atCurrent) return null;

  // Walk forward past any further contiguous picks: a worker that autodrafted
  // several times without advancing would leave more than one.
  let next = draft.currentPick + 1;
  const byOverall = new Set(picks.map((pick) => pick.overallNo));
  while (byOverall.has(next)) next += 1;

  return { pick: atCurrent, nextCurrentPick: next };
}

/**
 * Who is on the clock, or null when nobody is.
 *
 * Null covers every legitimate reason there is no pick to wait for: the draft
 * has not started, it is paused, it is complete, or every pick has been made.
 * A paused draft deliberately has nobody on the clock — that is what pausing
 * means, and the worker must not autodraft through it.
 */
export function whoIsOnClock(draft: DraftState, picks: readonly EnginePick[]): OnClock | null {
  if (draft.status !== "live") return null;

  const total = totalPicks(draft);
  const sequence = buildPickOrder(draft.format, draft.memberIds, draft.rounds);

  // The first unpicked number at or after `current_pick`. See the module note:
  // this is the correction for a pick that landed without the draft advancing.
  const taken = new Set(picks.map((pick) => pick.overallNo));
  let overallNo = Math.max(draft.currentPick, 1);
  const fromPicks = highestPickedOverallNo(picks) + 1;
  if (fromPicks > overallNo) overallNo = fromPicks;
  while (taken.has(overallNo)) overallNo += 1;

  if (overallNo > total) return null;

  const { round, slot } = roundAndSlot(overallNo, draft.memberIds.length);
  return { overallNo, memberId: memberAt(sequence, overallNo), round, slot };
}

/**
 * Is every pick in? Answered from the picks, not from `status`, so a draft whose
 * final advance was lost still reads as finished.
 */
export function isDraftComplete(draft: DraftState, picks: readonly EnginePick[]): boolean {
  const total = totalPicks(draft);
  const taken = new Set(picks.map((pick) => pick.overallNo));
  for (let overallNo = 1; overallNo <= total; overallNo += 1) {
    if (!taken.has(overallNo)) return false;
  }
  return true;
}
