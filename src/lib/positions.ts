import type { Position } from "@/lib/engine";

/**
 * Position words, and how to say a run of them.
 *
 * Extracted from `roster-radar.tsx`, which had the only copy, when the cheat
 * sheet needed the same sentence and 3.4a's first pass wrote a second one that
 * joined with `" and "` — so three positions came out as "5 G and 5 F and 3 C".
 * One list-join in the app, in one place.
 *
 * American **center**, everywhere it reaches a user: PRODUCT.md, CLAUDE.md, the
 * blueprint, `settings.ts`, `legality.ts` and the Euroleague API all say
 * Center, and 3.2 had to be corrected for drifting to the British spelling.
 * (`normalize.ts` keeps `centre` as an *input* alias, which is a different job.)
 */
export const POSITION_WORD: Record<Position, [string, string]> = {
  G: ["guard", "guards"],
  F: ["forward", "forwards"],
  C: ["center", "centers"],
};

/**
 * "3 guards, 4 forwards and 3 centers". Zeros are omitted, so a full roster
 * comes back as `empty` rather than as "0 guards, 0 forwards and 0 centers".
 */
export function positionSentence(
  counts: Readonly<Partial<Record<Position, number>>>,
  empty = "nothing",
): string {
  const parts = (["G", "F", "C"] as const)
    .filter((position) => (counts[position] ?? 0) > 0)
    .map((position) => {
      const count = counts[position] ?? 0;
      const [one, many] = POSITION_WORD[position];
      return `${count} ${count === 1 ? one : many}`;
    });
  if (parts.length === 0) return empty;
  if (parts.length === 1) return parts[0]!;
  return `${parts.slice(0, -1).join(", ")} and ${parts.at(-1)}`;
}
