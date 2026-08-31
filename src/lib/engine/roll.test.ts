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
