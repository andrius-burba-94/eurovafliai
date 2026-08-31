import { describe, expect, it } from "vitest";

import { findUnadvancedPick, isDraftComplete, totalPicks, whoIsOnClock } from "./clock";
import type { DraftState, EnginePick } from "./types";

const draft = (over: Partial<DraftState> = {}): DraftState => ({
  format: "snake",
  memberIds: ["A", "B", "C"],
  rounds: 3,
  currentPick: 1,
  status: "live",
  ...over,
});

/** Picks 1…n, each by whoever owns that overall number in an A,B,C snake. */
const snakeOwner = (overallNo: number): string => {
  const order = ["A", "B", "C", "C", "B", "A", "A", "B", "C"];
  return order[overallNo - 1];
};

const picksUpTo = (n: number): EnginePick[] =>
  Array.from({ length: n }, (_, i) => ({
    id: `pick${i + 1}`,
    overallNo: i + 1,
    memberId: snakeOwner(i + 1),
    playerId: `player${i + 1}`,
  }));

describe("totalPicks", () => {
  it("is members × rounds", () => {
    expect(totalPicks({ memberIds: ["A", "B", "C"], rounds: 3 })).toBe(9);
    expect(totalPicks({ memberIds: Array(12).fill("x"), rounds: 13 })).toBe(156);
  });
});

describe("whoIsOnClock — the normal path", () => {
  it("is the first member at the start of a live draft", () => {
    expect(whoIsOnClock(draft(), [])).toEqual({
      overallNo: 1,
      memberId: "A",
      round: 1,
      slot: 1,
    });
  });

  it("follows the snake into round 2", () => {
    // Overall 4 is the turn of the round: C picks 3rd and 4th.
    expect(whoIsOnClock(draft({ currentPick: 4 }), picksUpTo(3))?.memberId).toBe("C");
    expect(whoIsOnClock(draft({ currentPick: 4 }), picksUpTo(3))?.round).toBe(2);
  });

  it("reports the slot as drafted, so a reversed round starts at slot 1", () => {
    const onClock = whoIsOnClock(draft({ currentPick: 4 }), picksUpTo(3));
    expect(onClock).toMatchObject({ overallNo: 4, memberId: "C", round: 2, slot: 1 });
  });

  it("honours the format", () => {
    const linear = draft({ format: "linear", currentPick: 4 });
    expect(whoIsOnClock(linear, picksUpTo(3))?.memberId).toBe("A");
  });
});

describe("whoIsOnClock — nobody is on the clock", () => {
  it.each(["setup", "paused", "complete"] as const)("is null when status is %s", (status) => {
    // A paused draft deliberately has nobody on the clock: that is what pausing
    // means, and the worker must not autodraft through it.
    expect(whoIsOnClock(draft({ status }), [])).toBeNull();
  });

  it("is null once every pick is in", () => {
    expect(whoIsOnClock(draft({ currentPick: 10 }), picksUpTo(9))).toBeNull();
  });

  it("is null when current_pick has run past the end, whatever it says", () => {
    expect(whoIsOnClock(draft({ currentPick: 999 }), picksUpTo(9))).toBeNull();
  });
});

describe("whoIsOnClock — the un-advanced pick", () => {
  it("moves on when a pick exists for current_pick", () => {
    // §3's repairable state: the pick landed, the advance did not. Believing
    // current_pick would put A back on the clock for a pick they already made.
    const onClock = whoIsOnClock(draft({ currentPick: 1 }), picksUpTo(1));
    expect(onClock).toMatchObject({ overallNo: 2, memberId: "B" });
  });

  it("skips several, for a worker that autodrafted more than once", () => {
    const onClock = whoIsOnClock(draft({ currentPick: 1 }), picksUpTo(5));
    expect(onClock).toMatchObject({ overallNo: 6, memberId: "A" });
  });

  it("never goes backwards, even if current_pick is stale and low", () => {
    // A stale low current_pick with picks well past it must not re-offer an
    // early pick — the picks are the harder evidence.
    const onClock = whoIsOnClock(draft({ currentPick: 2 }), picksUpTo(7));
    expect(onClock?.overallNo).toBe(8);
  });

  it("returns null rather than a phantom pick when the last one was un-advanced", () => {
    expect(whoIsOnClock(draft({ currentPick: 9 }), picksUpTo(9))).toBeNull();
  });
});

describe("findUnadvancedPick", () => {
  it("is null on a fresh draft", () => {
    expect(findUnadvancedPick(draft(), [])).toBeNull();
  });

  it("is null in the normal state, where current_pick has no pick yet", () => {
    expect(findUnadvancedPick(draft({ currentPick: 4 }), picksUpTo(3))).toBeNull();
  });

  it("finds the pick and the number to advance to", () => {
    const found = findUnadvancedPick(draft({ currentPick: 3 }), picksUpTo(3));
    expect(found?.pick.overallNo).toBe(3);
    expect(found?.nextCurrentPick).toBe(4);
  });

  it("walks past a run of un-advanced picks", () => {
    const found = findUnadvancedPick(draft({ currentPick: 1 }), picksUpTo(4));
    expect(found?.pick.overallNo).toBe(1);
    expect(found?.nextCurrentPick).toBe(5);
  });

  it("is idempotent: applying the repair leaves nothing to find", () => {
    const before = findUnadvancedPick(draft({ currentPick: 3 }), picksUpTo(3));
    expect(before).not.toBeNull();
    const repaired = draft({ currentPick: before!.nextCurrentPick });
    expect(findUnadvancedPick(repaired, picksUpTo(3))).toBeNull();
  });

  it("points past the end when the final pick was the un-advanced one", () => {
    const found = findUnadvancedPick(draft({ currentPick: 9 }), picksUpTo(9));
    expect(found?.nextCurrentPick).toBe(10); // == totalPicks + 1, i.e. complete
  });
});

describe("isDraftComplete", () => {
  it("is false for a fresh draft", () => {
    expect(isDraftComplete(draft(), [])).toBe(false);
  });

  it("is false while picks remain", () => {
    expect(isDraftComplete(draft(), picksUpTo(8))).toBe(false);
  });

  it("is true when every overall number has a pick", () => {
    expect(isDraftComplete(draft(), picksUpTo(9))).toBe(true);
  });

  it("is true even when status still says live, so a lost final advance still reads as done", () => {
    expect(isDraftComplete(draft({ status: "live", currentPick: 9 }), picksUpTo(9))).toBe(true);
  });

  it("is false when a gap remains, however many picks there are", () => {
    // Count is not progress: a rollback deletes from the top and a repair can
    // leave a hole, so length would lie here.
    const withGap = picksUpTo(9).filter((pick) => pick.overallNo !== 5);
    expect(withGap).toHaveLength(8);
    expect(isDraftComplete(draft(), withGap)).toBe(false);
  });
});
