import { describe, expect, it } from "vitest";

import { rankForMember, selectAutoPick } from "./autodraft";
import type { EnginePlayer, Position, RosterTemplate } from "./types";

const TEMPLATE: RosterTemplate = { G: 5, F: 5, C: 3 };

const p = (id: string, position: Position, projectedPoints?: number): EnginePlayer => ({
  id,
  position,
  ...(projectedPoints === undefined ? {} : { projectedPoints }),
});

const roster = (g: number, f: number, c: number): { position: Position }[] => [
  ...Array.from({ length: g }, () => ({ position: "G" as const })),
  ...Array.from({ length: f }, () => ({ position: "F" as const })),
  ...Array.from({ length: c }, () => ({ position: "C" as const })),
];

const ids = (players: readonly EnginePlayer[]): string[] => players.map((x) => x.id);
const none = new Set<string>();

describe("rankForMember — projection order", () => {
  it("sorts by projection, best first", () => {
    const pool = [p("low", "G", 5), p("high", "G", 30), p("mid", "G", 12)];
    expect(ids(rankForMember(pool))).toEqual(["high", "mid", "low"]);
  });

  it("treats a missing projection as worse than any number, including negatives", () => {
    // Not zero: an unprojected player must not outrank someone projected at -2.
    const pool = [p("unknown", "G"), p("bad", "G", -2)];
    expect(ids(rankForMember(pool))).toEqual(["bad", "unknown"]);
  });

  it("breaks ties by id, so the same draft replays identically", () => {
    const pool = [p("zeta", "G", 10), p("alpha", "G", 10), p("mike", "G", 10)];
    expect(ids(rankForMember(pool))).toEqual(["alpha", "mike", "zeta"]);
  });

  it("breaks a tie by id when NOBODY has a projection", () => {
    // The case that mattered and was missed: with no projections anywhere,
    // subtracting two `-Infinity`s gave NaN, `Array#sort` read NaN as "equal",
    // and the ranking quietly became the order the caller happened to pass.
    // Until Phase 4.4 ships projections, this is the only pool shape there is.
    const pool = [p("zeta", "G"), p("alpha", "G"), p("mike", "G")];
    expect(ids(rankForMember(pool))).toEqual(["alpha", "mike", "zeta"]);
  });

  it("keeps a projected player ahead of an unprojected one either way round", () => {
    // Both orderings of the same pair, because a comparator that returns NaN
    // passes one of them by luck.
    expect(ids(rankForMember([p("none", "G"), p("some", "G", 1)]))).toEqual([
      "some",
      "none",
    ]);
    expect(ids(rankForMember([p("some", "G", 1), p("none", "G")]))).toEqual([
      "some",
      "none",
    ]);
  });

  it("does not mutate the pool it was given", () => {
    const pool = [p("b", "G", 1), p("a", "G", 2)];
    const before = ids(pool);
    rankForMember(pool);
    expect(ids(pool)).toEqual(before);
  });
});

describe("rankForMember — the cheat sheet", () => {
  it("puts sheet players first, in the sheet's own order", () => {
    const pool = [p("star", "G", 99), p("mine1", "F", 1), p("mine2", "C", 2)];
    expect(ids(rankForMember(pool, ["mine1", "mine2"]))).toEqual(["mine1", "mine2", "star"]);
  });

  it("beats projection: the sheet is the member's opinion and it wins", () => {
    const pool = [p("obvious", "G", 100), p("hunch", "G", 1)];
    expect(ids(rankForMember(pool, ["hunch"]))[0]).toBe("hunch");
  });

  it("falls through to projection once the sheet runs out", () => {
    const pool = [p("sheet", "G", 1), p("good", "F", 50), p("poor", "C", 2)];
    expect(ids(rankForMember(pool, ["sheet"]))).toEqual(["sheet", "good", "poor"]);
  });

  it("ignores sheet entries that are not in the pool", () => {
    // Sheets are uploaded by hand and fuzzy-matched, so they can name players
    // who do not exist here. That must not fail the autodraft tick.
    const pool = [p("real", "G", 10)];
    expect(ids(rankForMember(pool, ["ghost", "real"]))).toEqual(["real"]);
  });

  it("ignores a duplicated sheet entry rather than listing the player twice", () => {
    const pool = [p("a", "G", 1), p("b", "F", 2)];
    expect(ids(rankForMember(pool, ["a", "a"]))).toEqual(["a", "b"]);
  });

  it("lists every pool player exactly once, sheet or not", () => {
    const pool = [p("a", "G", 1), p("b", "F", 2), p("c", "C", 3)];
    const ranked = ids(rankForMember(pool, ["c", "ghost"]));
    expect(ranked).toHaveLength(3);
    expect(new Set(ranked).size).toBe(3);
  });
});

describe("selectAutoPick", () => {
  it("takes the best available", () => {
    const pool = [p("best", "G", 40), p("worse", "G", 10)];
    expect(
      selectAutoPick({ candidates: pool, roster: [], template: TEMPLATE, takenPlayerIds: none })?.id,
    ).toBe("best");
  });

  it("skips a player somebody else already took", () => {
    const pool = [p("gone", "G", 99), p("available", "G", 10)];
    const picked = selectAutoPick({
      candidates: pool,
      roster: [],
      template: TEMPLATE,
      takenPlayerIds: new Set(["gone"]),
    });
    expect(picked?.id).toBe("available");
  });

  it("prefers the cheat sheet, but skips sheet players already gone", () => {
    const pool = [p("first", "F", 1), p("second", "F", 2), p("star", "G", 99)];
    const picked = selectAutoPick({
      candidates: pool,
      cheatSheet: ["first", "second"],
      roster: [],
      template: TEMPLATE,
      takenPlayerIds: new Set(["first"]),
    });
    expect(picked?.id).toBe("second");
  });

  it("filters by legality AFTER ranking, not before", () => {
    // The rule that matters. The top of the ranking is a guard and the member's
    // guard slots are full, so the answer is the best legal player — not the
    // best player, and not "no pick".
    const pool = [p("topGuard", "G", 99), p("goodForward", "F", 50), p("poorForward", "F", 1)];
    const picked = selectAutoPick({
      candidates: pool,
      roster: roster(5, 0, 0),
      template: TEMPLATE,
      takenPlayerIds: none,
    });
    expect(picked?.id).toBe("goodForward");
  });

  it("obeys the endgame: only a center is legal, so only a center is picked", () => {
    // §6 of the invariants, through autodraft. A "best available" that ignored
    // position would happily take the guard into a full slot.
    const pool = [p("bigGuard", "G", 99), p("bigForward", "F", 98), p("smallCenter", "C", 3)];
    const picked = selectAutoPick({
      candidates: pool,
      roster: roster(5, 5, 2),
      template: TEMPLATE,
      takenPlayerIds: none,
    });
    expect(picked?.id).toBe("smallCenter");
  });

  it("obeys the endgame even when the cheat sheet says otherwise", () => {
    // The sheet outranks projection, never legality.
    const pool = [p("myGuy", "G", 1), p("center", "C", 1)];
    const picked = selectAutoPick({
      candidates: pool,
      cheatSheet: ["myGuy"],
      roster: roster(5, 5, 2),
      template: TEMPLATE,
      takenPlayerIds: none,
    });
    expect(picked?.id).toBe("center");
  });

  it("is null when the roster is complete", () => {
    expect(
      selectAutoPick({
        candidates: [p("anyone", "C", 10)],
        roster: roster(5, 5, 3),
        template: TEMPLATE,
        takenPlayerIds: none,
      }),
    ).toBeNull();
  });

  it("is null when nothing left in the pool fits an open slot", () => {
    // A real outcome, not an error: §7 says the worker must leave the draft for
    // the commissioner rather than write something wrong.
    const pool = [p("g1", "G", 10), p("g2", "G", 9)];
    expect(
      selectAutoPick({
        candidates: pool,
        roster: roster(5, 0, 0),
        template: TEMPLATE,
        takenPlayerIds: none,
      }),
    ).toBeNull();
  });

  it("is null on an empty pool", () => {
    expect(
      selectAutoPick({ candidates: [], roster: [], template: TEMPLATE, takenPlayerIds: none }),
    ).toBeNull();
  });

  it("is deterministic across repeated calls and input order", () => {
    const a = [p("x", "G", 10), p("y", "G", 10), p("z", "G", 10)];
    const shuffled = [a[2], a[0], a[1]];
    const first = selectAutoPick({
      candidates: a,
      roster: [],
      template: TEMPLATE,
      takenPlayerIds: none,
    });
    const second = selectAutoPick({
      candidates: shuffled,
      roster: [],
      template: TEMPLATE,
      takenPlayerIds: none,
    });
    expect(first?.id).toBe("x");
    expect(second?.id).toBe("x");
  });

  it("can autodraft a whole legal 13-man roster", () => {
    // The end-to-end property: repeatedly autodrafting must terminate with a
    // roster that exactly matches the template, never an illegal one.
    const pool: EnginePlayer[] = [];
    for (let i = 0; i < 30; i += 1) {
      pool.push(p(`g${i}`, "G", 100 - i), p(`f${i}`, "F", 90 - i), p(`c${i}`, "C", 80 - i));
    }
    const taken = new Set<string>();
    const own: { position: Position }[] = [];

    for (let round = 0; round < 13; round += 1) {
      const picked = selectAutoPick({
        candidates: pool,
        roster: own,
        template: TEMPLATE,
        takenPlayerIds: taken,
      });
      expect(picked, `round ${round + 1} found no legal pick`).not.toBeNull();
      taken.add(picked!.id);
      own.push({ position: picked!.position });
    }

    expect(own).toHaveLength(13);
    const tally = { G: 0, F: 0, C: 0 };
    for (const slot of own) tally[slot.position] += 1;
    expect(tally).toEqual(TEMPLATE);

    // And a 14th attempt finds nothing, rather than overfilling.
    expect(
      selectAutoPick({ candidates: pool, roster: own, template: TEMPLATE, takenPlayerIds: taken }),
    ).toBeNull();
  });
});
