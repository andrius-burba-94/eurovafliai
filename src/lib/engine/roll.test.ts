import { describe, expect, it } from "vitest";

import { rollOrder } from "./roll";

const members = ["m1", "m2", "m3", "m4", "m5", "m6", "m7", "m8"];

describe("rollOrder", () => {
  it("is a permutation: everyone drafts exactly once", () => {
    const order = rollOrder(members, "seed-a");
    expect(order).toHaveLength(members.length);
    expect([...order].sort()).toEqual([...members].sort());
  });

  it("replays identically from the same seed", () => {
    // The whole reason the engine may not touch randomness. The seed is stored,
    // so "who rolled what" is reproducible months later — and a member who
    // missed the reveal can be shown the same roll rather than a new one.
    expect(rollOrder(members, "seed-a")).toEqual(rollOrder(members, "seed-a"));
  });

  it("gives a different order for a different seed", () => {
    expect(rollOrder(members, "seed-a")).not.toEqual(
      rollOrder(members, "seed-b"),
    );
  });

  it("does not depend on the order the members arrive in", () => {
    // A roll must be fair regardless of who joined first, so the input is
    // sorted before shuffling. Otherwise join order would leak into the result
    // for a given seed, and the commissioner could re-roll by kicking and
    // re-inviting somebody.
    const shuffledInput = ["m5", "m1", "m8", "m3", "m2", "m7", "m4", "m6"];
    expect(rollOrder(shuffledInput, "seed-a")).toEqual(
      rollOrder(members, "seed-a"),
    );
  });

  it("handles every league size the product allows", () => {
    for (let size = 2; size <= 12; size += 1) {
      const ids = Array.from({ length: size }, (_, i) => `m${i + 1}`);
      const order = rollOrder(ids, `seed-${size}`);
      expect(order).toHaveLength(size);
      expect(new Set(order).size).toBe(size);
    }
  });

  it("returns a single member unchanged, and refuses an empty league", () => {
    expect(rollOrder(["only"], "seed")).toEqual(["only"]);
    expect(() => rollOrder([], "seed")).toThrow(/no members/i);
  });

  it("refuses a duplicate member id", () => {
    // Would produce an order where somebody drafts twice and somebody never
    // does. The unique(league, user) index makes this impossible in the
    // database; the engine refuses it anyway rather than trusting its caller.
    expect(() => rollOrder(["m1", "m1", "m2"], "seed")).toThrow(/duplicate/i);
  });

  it("refuses an empty seed, which would not be a roll at all", () => {
    expect(() => rollOrder(members, "")).toThrow(/seed/i);
  });

  it("actually mixes, rather than mostly preserving the input", () => {
    // A weak PRNG or an off-by-one in Fisher-Yates can leave most members in
    // place, which looks random until somebody notices the same person keeps
    // drafting first. Across many seeds, every member should reach the first
    // slot sometimes.
    const firstSlots = new Set<string>();
    for (let i = 0; i < 200; i += 1) {
      firstSlots.add(rollOrder(members, `seed-${i}`)[0]!);
    }
    expect(firstSlots.size).toBe(members.length);
  });

  // Reported from production: "it seems that the commissioner always gets
  // better pick (nearly all the time 1st)". The engine was measured rather than
  // defended — 200,000 rolls per league size, every slot within noise — and
  // these two tests are what that measurement leaves behind, because "I trust
  // the algorithm" is not a guard and Fisher-Yates is easy to break in a
  // refactor.
  //
  // What the report turned out to be is worth recording next to them: the roll
  // was being *re-applied*, not re-drawn. A seeded roll reproduces the same
  // order every time by design, and until the fix in #119 every press
  // announced itself as a fresh draw — so one roll that happened to put the
  // commissioner first was reported ~50 times over.
  it("gives the member who joined first no edge at all", () => {
    // The app reads members `sort: "created"`, so the commissioner is index 0
    // of the input. Passed in that order here on purpose: if join order leaked
    // into the outcome, this is the member it would favour.
    const size = 12;
    const ids = Array.from({ length: size }, (_, i) => `m${i + 1}`);
    const commissioner = ids[0]!;
    const runs = 12_000;
    const slots = new Array<number>(size).fill(0);

    for (let i = 0; i < runs; i += 1) {
      slots[rollOrder(ids, uuidShapedSeed(i)).indexOf(commissioner)] += 1;
    }

    const expected = runs / size;
    for (const count of slots) {
      // ±20% is ~6.6 standard deviations here, so it cannot flake, and it still
      // fails hard on any real positional bias.
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
    // Every slot reached, including the last: a bias that merely *reduced* the
    // commissioner's first picks would still be a bias.
    expect(slots.every((count) => count > 0)).toBe(true);
  });

  it("distributes the first slot evenly for seeds shaped like the real ones", () => {
    // The tests above use `s0`, `s1`, `s2`. Production seeds are
    // `crypto.randomUUID()` — 36 characters, fixed hyphens, a constant version
    // nibble and only 16 distinct symbols. A string hash can spread short
    // counters well and clump on input that regular, so the seed shape the app
    // actually uses is asserted rather than assumed.
    const counts = new Map<string, number>();
    const runs = 8_000;
    for (let i = 0; i < runs; i += 1) {
      const first = rollOrder(members, uuidShapedSeed(i))[0]!;
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    expect(counts.size).toBe(members.length);
    const expected = runs / members.length;
    for (const [, count] of counts) {
      expect(count).toBeGreaterThan(expected * 0.8);
      expect(count).toBeLessThan(expected * 1.2);
    }
  });

  it("distributes the first slot roughly evenly across seeds", () => {
    const counts = new Map<string, number>();
    const runs = 4000;
    for (let i = 0; i < runs; i += 1) {
      const first = rollOrder(members, `s${i}`)[0]!;
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    const expected = runs / members.length;
    for (const [, count] of counts) {
      // ±35% of the expected share: loose enough not to be flaky, tight enough
      // to catch a shuffle that favours one slot.
      expect(count).toBeGreaterThan(expected * 0.65);
      expect(count).toBeLessThan(expected * 1.35);
    }
  });
});

/**
 * A v4-shaped UUID, deterministically, from a counter.
 *
 * The fairness tests need the *shape* of a real seed — 36 chars, hyphens at
 * fixed offsets, the `4` version nibble, 16 symbols — without the
 * non-determinism of `crypto.randomUUID()`, because a fairness test that can
 * flake is a fairness test people learn to re-run.
 */
function uuidShapedSeed(n: number): string {
  let a = (n + 1) * 0x9e3779b1;
  const hex = () => {
    a ^= a << 13;
    a ^= a >>> 17;
    a ^= a << 5;
    return ((a >>> 0) % 16).toString(16);
  };
  const run = (length: number) => Array.from({ length }, () => hex()).join("");
  return `${run(8)}-${run(4)}-4${run(3)}-a${run(3)}-${run(12)}`;
}
