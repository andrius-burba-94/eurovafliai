import { describe, expect, it } from "vitest";

import { applyOperation, type SheetOperation } from "./reorder";
import type { SheetRanking } from "./ranking";
import { tierOfRank } from "./ranking";

/**
 * The arithmetic of editing a sheet by hand — slice 3.4b.
 *
 * Every one of these questions is really about a function, so none of them
 * belongs in a browser. The load-bearing property is the one the model was
 * chosen for: **a break is a place, not a label**, so moving a player past a
 * break changes that player's tier and leaves the break where it was put. The
 * opposite model — a tier that travels with the player — re-groups the whole
 * sheet around one move, which is the failure `ranking.ts` argues against in
 * writing.
 */

/** Ten players, broken 1–3 / 4–7 / 8–10. The fixture the model is argued on. */
const TEN: SheetRanking = {
  ranking: ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"],
  tiers: [3, 7],
};

const apply = (sheet: SheetRanking, operation: SheetOperation) =>
  applyOperation(sheet, operation);

describe("applyOperation — move", () => {
  it("moves a player down to the given rank", () => {
    const next = apply(TEN, { kind: "move", playerId: "b", toRank: 8 });
    expect(next.ranking).toEqual([
      "a",
      "c",
      "d",
      "e",
      "f",
      "g",
      "h",
      "b",
      "i",
      "j",
    ]);
  });

  it("moves a player up to the given rank", () => {
    const next = apply(TEN, { kind: "move", playerId: "h", toRank: 2 });
    expect(next.ranking).toEqual([
      "a",
      "h",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "i",
      "j",
    ]);
  });

  it("leaves the breaks untouched, so the moved player changes tier", () => {
    // The whole model, in one assertion. `b` was #2 in tier 1; at #8 it is in
    // tier 3, and the breaks are still where the writer put them.
    const next = apply(TEN, { kind: "move", playerId: "b", toRank: 8 });
    expect(next.tiers).toEqual([3, 7]);
    expect(tierOfRank(2, TEN.tiers)).toBe(1);
    expect(tierOfRank(8, next.tiers)).toBe(3);
  });

  it("moves a player across two breaks", () => {
    const next = apply(TEN, { kind: "move", playerId: "j", toRank: 1 });
    expect(next.ranking[0]).toBe("j");
    expect(next.tiers).toEqual([3, 7]);
  });

  it("never changes how many players are ranked", () => {
    for (const toRank of [1, 2, 5, 9, 10]) {
      const next = apply(TEN, { kind: "move", playerId: "e", toRank });
      expect(next.ranking).toHaveLength(TEN.ranking.length);
      expect(new Set(next.ranking).size).toBe(TEN.ranking.length);
    }
  });

  it("refuses to move above the first rank or below the last", () => {
    // A clamp rather than a throw: `↑` on #1 is a button somebody can press,
    // and the honest answer is that the sheet did not move.
    expect(apply(TEN, { kind: "move", playerId: "a", toRank: 0 }).ranking).toEqual(
      TEN.ranking,
    );
    expect(
      apply(TEN, { kind: "move", playerId: "j", toRank: 11 }).ranking,
    ).toEqual(TEN.ranking);
  });

  it("is a no-op for a player who is not on the sheet", () => {
    // The sheet can move under a stale tab: a remove elsewhere, or a re-paste.
    // The operation is applied to the *stored* sheet, so this is reachable and
    // must not throw or invent a rank.
    const next = apply(TEN, { kind: "move", playerId: "zz", toRank: 3 });
    expect(next).toEqual(TEN);
  });

  it("is a no-op when the player is already at that rank", () => {
    expect(apply(TEN, { kind: "move", playerId: "c", toRank: 3 })).toEqual(TEN);
  });
});

describe("applyOperation — nudge", () => {
  // A nudge is relative because `↑` pressed twice quickly must move two places.
  // Expressed as an absolute rank computed on the client, both presses resolved
  // to the same destination and the second was a no-op — which is exactly what
  // an E2E spec caught, and why this operation exists at all.

  it("moves one place better", () => {
    expect(apply(TEN, { kind: "nudge", playerId: "d", by: -1 }).ranking).toEqual(
      ["a", "b", "d", "c", "e", "f", "g", "h", "i", "j"],
    );
  });

  it("moves one place worse", () => {
    expect(apply(TEN, { kind: "nudge", playerId: "d", by: 1 }).ranking).toEqual(
      ["a", "b", "c", "e", "d", "f", "g", "h", "i", "j"],
    );
  });

  it("composes, so two nudges move two places", () => {
    const once = apply(TEN, { kind: "nudge", playerId: "j", by: -1 });
    const twice = apply(once, { kind: "nudge", playerId: "j", by: -1 });
    expect(twice.ranking.indexOf("j")).toBe(7);
    // This is the property the absolute version silently failed: applying the
    // *same* operation twice must move the player twice.
    expect(twice.ranking).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
      "j",
      "h",
      "i",
    ]);
  });

  it("clamps at both ends rather than wrapping or throwing", () => {
    expect(apply(TEN, { kind: "nudge", playerId: "a", by: -1 })).toEqual(TEN);
    expect(apply(TEN, { kind: "nudge", playerId: "j", by: 1 })).toEqual(TEN);
    expect(apply(TEN, { kind: "nudge", playerId: "a", by: -99 })).toEqual(TEN);
  });

  it("leaves the breaks alone, like every other move", () => {
    expect(apply(TEN, { kind: "nudge", playerId: "c", by: 1 }).tiers).toEqual([
      3, 7,
    ]);
  });

  it("is a no-op for a player who is not on the sheet", () => {
    expect(apply(TEN, { kind: "nudge", playerId: "zz", by: -1 })).toEqual(TEN);
  });
});

describe("applyOperation — remove", () => {
  it("drops the player and closes the gap", () => {
    const next = apply(TEN, { kind: "remove", playerId: "d" });
    expect(next.ranking).toEqual([
      "a",
      "b",
      "c",
      "e",
      "f",
      "g",
      "h",
      "i",
      "j",
    ]);
  });

  it("decrements every break above the removed player", () => {
    // `d` was #4, inside tier 2. Both breaks above it must come down by one or
    // the tiers silently re-group around a removal.
    expect(apply(TEN, { kind: "remove", playerId: "d" }).tiers).toEqual([3, 6]);
  });

  it("leaves breaks below the removed player alone", () => {
    expect(apply(TEN, { kind: "remove", playerId: "i" }).tiers).toEqual([3, 7]);
  });

  it("decrements a break the removed player sat exactly on", () => {
    // `c` is #3 and the break is at 3 — the last player of tier 1. Removing it
    // must pull the break to 2, leaving `a`,`b` as tier 1.
    const next = apply(TEN, { kind: "remove", playerId: "c" });
    expect(next.tiers).toEqual([2, 6]);
    expect(tierOfRank(3, next.tiers)).toBe(2);
  });

  it("drops a break that empties, rather than keeping a break of nothing", () => {
    // Two players, one break between them. Remove the first and the break at 1
    // would describe a tier with nobody in it.
    const pair: SheetRanking = { ranking: ["a", "b"], tiers: [1] };
    expect(apply(pair, { kind: "remove", playerId: "a" })).toEqual({
      ranking: ["b"],
      tiers: [],
    });
  });

  it("always shortens the sheet by exactly one", () => {
    for (const playerId of TEN.ranking) {
      expect(apply(TEN, { kind: "remove", playerId }).ranking).toHaveLength(9);
    }
  });

  it("is a no-op for a player who is not on the sheet", () => {
    expect(apply(TEN, { kind: "remove", playerId: "zz" })).toEqual(TEN);
  });

  it("empties the sheet cleanly on the last player", () => {
    const one: SheetRanking = { ranking: ["a"], tiers: [] };
    expect(apply(one, { kind: "remove", playerId: "a" })).toEqual({
      ranking: [],
      tiers: [],
    });
  });
});

describe("applyOperation — tier breaks", () => {
  it("starts a new tier at the given rank", () => {
    const next = apply(TEN, { kind: "break", atRank: 5 });
    expect(next.tiers).toEqual([3, 4, 7]);
    expect(tierOfRank(5, next.tiers)).toBe(3);
  });

  it("clears a break the row already starts", () => {
    // #4 starts tier 2, i.e. the break at 3. Pressing it again clears it.
    expect(apply(TEN, { kind: "break", atRank: 4 }).tiers).toEqual([7]);
  });

  it("refuses a break at the first rank", () => {
    // A break before the first player describes nothing, and `asBreaks` rejects
    // a 0 on the way back out of the database. The row does not offer the
    // control; this is the second line of defence.
    expect(apply(TEN, { kind: "break", atRank: 1 }).tiers).toEqual([3, 7]);
  });

  it("refuses a break past the end of the sheet", () => {
    expect(apply(TEN, { kind: "break", atRank: 11 }).tiers).toEqual([3, 7]);
    expect(apply(TEN, { kind: "break", atRank: 99 }).tiers).toEqual([3, 7]);
  });

  it("keeps the breaks sorted and unique", () => {
    const next = apply(
      apply(TEN, { kind: "break", atRank: 10 }),
      { kind: "break", atRank: 2 },
    );
    expect(next.tiers).toEqual([1, 3, 7, 9]);
  });

  it("does not touch the ranking", () => {
    expect(apply(TEN, { kind: "break", atRank: 5 }).ranking).toEqual(
      TEN.ranking,
    );
  });
});

describe("applyOperation — purity", () => {
  it("never mutates the sheet it was given", () => {
    const sheet: SheetRanking = { ranking: ["a", "b", "c"], tiers: [2] };
    const before = JSON.stringify(sheet);
    apply(sheet, { kind: "move", playerId: "a", toRank: 3 });
    apply(sheet, { kind: "remove", playerId: "b" });
    apply(sheet, { kind: "break", atRank: 2 });
    expect(JSON.stringify(sheet)).toBe(before);
  });
});
