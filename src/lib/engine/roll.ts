/**
 * The roll: turning a seed into the draft order.
 *
 * Pure and deterministic, like everything else under `src/lib/engine/`. The
 * engine may not touch randomness at all — `purity.test.ts` greps for
 * `Math.random` and `crypto.randomUUID` — and the reason is not tidiness: the
 * seed is stored, so a roll replays identically. Months later you can prove who
 * drew first, a member who missed the reveal sees the same roll rather than a
 * fresh one, and the animated reveal in 2.3b can replay it from the seed instead
 * of holding state.
 *
 * Generating the seed is the caller's job, and it belongs outside the engine:
 * `crypto.randomUUID()` in a server action, stored on the league.
 */

/**
 * A small, fast, well-distributed PRNG (mulberry32). Chosen over a hand-rolled
 * LCG because a weak generator produces a shuffle that looks random until
 * somebody notices the same member keeps drafting first — and this one is four
 * lines and passes the distribution test in `roll.test.ts`.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** FNV-1a: a string seed to a 32-bit number, deterministically. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * The draft order for a league, from its members and its seed.
 *
 * Feeds `buildPickOrder`, which takes members already in order — this is the
 * function that decides that order for `order_mode: "roll"`.
 *
 * The input is **sorted before shuffling**, so the result depends on the set of
 * members and the seed and nothing else. Without that, join order would leak
 * into the outcome for a given seed, which would let a commissioner re-roll by
 * kicking and re-inviting somebody.
 */
export function rollOrder(
  memberIds: readonly string[],
  seed: string,
): string[] {
  if (memberIds.length === 0) {
    throw new Error("Cannot roll a draft order with no members.");
  }
  if (new Set(memberIds).size !== memberIds.length) {
    throw new Error(
      "Cannot roll a draft order with a duplicate member id: somebody would draft twice and somebody never would.",
    );
  }
  if (!seed) {
    throw new Error(
      "Cannot roll without a seed: the roll has to be replayable.",
    );
  }

  const next = mulberry32(hashSeed(seed));
  const order = [...memberIds].sort();

  // Fisher-Yates, downwards. `i` reaching 1 rather than 0 is correct: element 0
  // has nothing left to swap with.
  for (let i = order.length - 1; i > 0; i -= 1) {
    const j = Math.floor(next() * (i + 1));
    [order[i], order[j]] = [order[j]!, order[i]!];
  }

  return order;
}
