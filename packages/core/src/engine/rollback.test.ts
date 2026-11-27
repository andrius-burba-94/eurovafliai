import { describe, expect, it } from "vitest";

import { computeRollback } from "./rollback";
import { whoIsOnClock } from "./clock";
import type { DraftState, EnginePick } from "./types";

/** A,B,C snake over 3 rounds: A B C | C B A | A B C. */
const draft = (over: Partial<DraftState> = {}): DraftState => ({
  format: "snake",
  memberIds: ["A", "B", "C"],
  rounds: 3,
  currentPick: 10,
  status: "live",
  ...over,
});

const SNAKE_OWNERS = ["A", "B", "C", "C", "B", "A", "A", "B", "C"];

const picksUpTo = (n: number): EnginePick[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `pick${i + 1}`,
    overallNo: i + 1,
    memberId: SNAKE_OWNERS[i],
    playerId: `player${i + 1}`,
  }));

const unwrap = (result: ReturnType<typeof computeRollback>) => {
  if (!result.ok) throw new Error(`expected ok, got: ${result.reason}`);
  return result.rollback;
};

describe("computeRollback — what it deletes", () => {
  it("deletes the target pick and everything after it", () => {
    // "Roll back to 7" means 7 becomes the pick being waited on again. Keeping
    // pick 7 would refuse the commissioner the one pick they asked to undo.
    const rollback = unwrap(computeRollback(draft(), picksUpTo(9), 7));
    expect(rollback.deletePickIds).toEqual(["pick9", "pick8", "pick7"]);
    expect(rollback.currentPick).toBe(7);
    expect(rollback.discardedCount).toBe(3);
  });

  it("deletes highest overall_no first", () => {
    // So a rollback that dies partway leaves a contiguous 1…n prefix, which is
    // the shape the rest of the engine assumes.
    const rollback = unwrap(computeRollback(draft(), picksUpTo(9), 4));
    const order = rollback.deletePickIds.map((id) => Number(id.replace("pick", "")));
    expect(order).toEqual([9, 8, 7, 6, 5, 4]);
  });

  it("rolls back to pick 1, wiping the draft", () => {
    const rollback = unwrap(computeRollback(draft(), picksUpTo(9), 1));
    expect(rollback.deletePickIds).toHaveLength(9);
    expect(rollback.currentPick).toBe(1);
    expect(rollback.memberOnClock).toBe("A");
  });

  it("rolls back to the last pick, discarding exactly one", () => {
    const rollback = unwrap(computeRollback(draft(), picksUpTo(9), 9));
    expect(rollback.deletePickIds).toEqual(["pick9"]);
    expect(rollback.currentPick).toBe(9);
    expect(rollback.discardedCount).toBe(1);
  });

  it("accepts a target with nothing to delete, as a no-op", () => {
    // Rolling back to the pick already on the clock. A double tap in the
    // commissioner console must not raise an error.
    const rollback = unwrap(computeRollback(draft({ currentPick: 5 }), picksUpTo(4), 5));
    expect(rollback.deletePickIds).toEqual([]);
    expect(rollback.discardedCount).toBe(0);
    expect(rollback.currentPick).toBe(5);
  });

  it("ignores picks below the target entirely", () => {
    const rollback = unwrap(computeRollback(draft(), picksUpTo(9), 6));
    for (const id of ["pick1", "pick2", "pick3", "pick4", "pick5"]) {
      expect(rollback.deletePickIds).not.toContain(id);
    }
  });
});

describe("computeRollback — snake direction survives it", () => {
  it("names the right member across a snake boundary", () => {
    // Overall 3 and 4 are both C — the turn of the round. A rollback to 4 must
    // put C back on the clock, not B.
    expect(unwrap(computeRollback(draft(), picksUpTo(9), 4)).memberOnClock).toBe("C");
    expect(unwrap(computeRollback(draft(), picksUpTo(9), 3)).memberOnClock).toBe("C");
    expect(unwrap(computeRollback(draft(), picksUpTo(9), 5)).memberOnClock).toBe("B");
  });

  it("agrees with whoIsOnClock after the revert is applied", () => {
    // The property that actually matters: apply the rollback and ask the clock.
    // If these two ever disagree, the draft resumes on the wrong member.
    for (let target = 1; target <= 9; target += 1) {
      const rollback = unwrap(computeRollback(draft(), picksUpTo(9), target));
      const surviving = picksUpTo(9).filter(
        (pick) => !rollback.deletePickIds.includes(pick.id),
      );
      const resumed = draft({ currentPick: rollback.currentPick, status: "live" });
      expect(whoIsOnClock(resumed, surviving)?.memberId, `target ${target}`).toBe(
        rollback.memberOnClock,
      );
      expect(whoIsOnClock(resumed, surviving)?.overallNo).toBe(target);
    }
  });

  it("names the right member under 3RR, where round 3 repeats round 2", () => {
    // 4 members, 3RR: ABCD DCBA DCBA. Overall 9 is D, not A as plain snake
    // would give.
    const rr = draft({ format: "snake3rr", memberIds: ["A", "B", "C", "D"], rounds: 3 });
    expect(unwrap(computeRollback(rr, [], 9)).memberOnClock).toBe("D");
    // And plain snake genuinely differs there, so the test is not vacuous.
    const snake = draft({ format: "snake", memberIds: ["A", "B", "C", "D"], rounds: 3 });
    expect(unwrap(computeRollback(snake, [], 9)).memberOnClock).toBe("A");
  });

  it("names the right member under linear", () => {
    const linear = draft({ format: "linear" });
    expect(unwrap(computeRollback(linear, picksUpTo(9), 4)).memberOnClock).toBe("A");
  });
});

describe("computeRollback — always pauses", () => {
  it("returns paused, whatever the draft was doing", () => {
    // The room needs a beat to read the system message before somebody is put
    // back on the clock.
    for (const status of ["live", "paused"] as const) {
      expect(unwrap(computeRollback(draft({ status }), picksUpTo(9), 5)).status).toBe("paused");
    }
  });
});

describe("computeRollback — refusals", () => {
  it("refuses 0 and negatives", () => {
    expect(computeRollback(draft(), picksUpTo(9), 0)).toEqual({
      ok: false,
      reason: "The earliest pick you can roll back to is 1.",
    });
    expect(computeRollback(draft(), picksUpTo(9), -3).ok).toBe(false);
  });

  it("refuses a target past the end of the draft, and says how long it is", () => {
    const result = computeRollback(draft(), picksUpTo(9), 10);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain("only has 9 picks");
  });

  it("refuses a non-integer", () => {
    expect(computeRollback(draft(), picksUpTo(9), 4.5).ok).toBe(false);
  });

  it("scales its bounds to the draft, not to a constant", () => {
    const big = draft({ memberIds: Array.from({ length: 12 }, (_, i) => `m${i}`), rounds: 13 });
    expect(computeRollback(big, [], 156).ok).toBe(true);
    expect(computeRollback(big, [], 157).ok).toBe(false);
  });
});
