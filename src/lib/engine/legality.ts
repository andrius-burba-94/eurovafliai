import type { EnginePlayer, Position, RosterTemplate, Verdict } from "./types";
import { rosterSize } from "./types";

/**
 * Is this pick legal? Availability **and** positional caps.
 *
 * Both halves are load-bearing and they fail differently. Availability stops
 * two members taking the same player; the caps stop one member taking six
 * guards. Neither is enforced anywhere else in a way that could be trusted —
 * the UI disables illegal picks, and the UI is a client.
 *
 * The template is passed in, never read from a constant here: blueprint §10
 * leaves open whether 12 participants drop to 11-man rosters, so the shape of a
 * legal team is a league setting.
 */

/** How many of each position a roster already holds. */
export function countByPosition(
  roster: readonly Pick<EnginePlayer, "position">[],
): Record<Position, number> {
  const counts: Record<Position, number> = { G: 0, F: 0, C: 0 };
  for (const player of roster) counts[player.position] += 1;
  return counts;
}

/**
 * Which positions this roster can still legally take.
 *
 * The draft room uses this to mute the pool (Phase 3.2's legality preview), and
 * `selectAutoPick` uses it indirectly. Worth its own export because "what do I
 * still need?" is a question the UI asks constantly and should not answer by
 * probing `isLegalPick` position by position.
 */
export function openPositions(
  roster: readonly Pick<EnginePlayer, "position">[],
  template: RosterTemplate,
): Position[] {
  const counts = countByPosition(roster);
  return (["G", "F", "C"] as const).filter((position) => counts[position] < template[position]);
}

export type LegalityInput = {
  readonly player: Pick<EnginePlayer, "id" | "position">;
  /** The picking member's roster so far. */
  readonly roster: readonly Pick<EnginePlayer, "position">[];
  readonly template: RosterTemplate;
  /**
   * Every player already taken in this draft, by anyone. A set rather than a
   * list because this is checked once per candidate per autodraft tick, and the
   * pool is ~350 players.
   */
  readonly takenPlayerIds: ReadonlySet<string>;
};

export function isLegalPick(input: LegalityInput): Verdict {
  const { player, roster, template, takenPlayerIds } = input;

  if (takenPlayerIds.has(player.id)) {
    return { ok: false, reason: "That player is already drafted." };
  }

  if (roster.length >= rosterSize(template)) {
    return { ok: false, reason: "Your roster is full." };
  }

  const counts = countByPosition(roster);
  if (counts[player.position] >= template[player.position]) {
    // The endgame case §6 of the invariants calls out: with G and F full, only
    // centers are legal, and this is the check that says so. A naive
    // implementation that only counted total roster size would let a member
    // take a sixth guard and end the draft with an illegal team.
    const still = openPositions(roster, template);
    return {
      ok: false,
      reason:
        still.length === 0
          ? "Your roster is full."
          : `You have all the ${player.position}s you can hold. Still open: ${still.join(", ")}.`,
    };
  }

  return { ok: true };
}
