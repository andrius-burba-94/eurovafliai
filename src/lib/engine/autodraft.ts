import { isLegalPick } from "./legality";
import type { EnginePlayer, RosterTemplate } from "./types";

/**
 * Who the engine picks for an absent or timed-out member.
 *
 * Two hard rules, both from the blueprint and both easy to get subtly wrong:
 *
 * 1. **Rank first, filter second.** Legality is applied by walking the ranked
 *    list and taking the first pick that passes — never by filtering the pool
 *    before ranking. Filtering first sounds equivalent and is not: it discards
 *    the information that the member's *actual* top choice was unavailable,
 *    and in the endgame it makes "best available" mean "best available guard"
 *    when no guard slot is left.
 * 2. **Deterministic, forever.** Nothing latency- or fairness-critical depends
 *    on an LLM or on chance. The same inputs must produce the same pick on
 *    every machine and every replay, so every tie is broken explicitly — down
 *    to player id, which is total.
 */

export type AutoPickInput = {
  /** The pool. May contain already-taken players; they are refused by legality. */
  readonly candidates: readonly EnginePlayer[];
  /**
   * The member's cheat sheet: player ids, best first. Absent or empty means
   * fall through to projection rank for everything.
   */
  readonly cheatSheet?: readonly string[];
  readonly roster: readonly Pick<EnginePlayer, "position">[];
  readonly template: RosterTemplate;
  readonly takenPlayerIds: ReadonlySet<string>;
};

/**
 * The pool in the order this member would want it, best first.
 *
 * Cheat sheet entries come first in the member's own order; everything else
 * follows by projection descending. Exported because the draft room pins "best
 * available from my sheet" (Phase 3.4) and must agree with what autodraft would
 * actually do — two rankings that disagree would make the pinned suggestion a
 * lie.
 */
export function rankForMember(
  candidates: readonly EnginePlayer[],
  cheatSheet: readonly string[] = [],
): EnginePlayer[] {
  const byId = new Map(candidates.map((player) => [player.id, player]));

  const sheeted: EnginePlayer[] = [];
  const seen = new Set<string>();
  for (const id of cheatSheet) {
    const player = byId.get(id);
    // A sheet can name players who are not in this pool at all — it is uploaded
    // by hand and fuzzy-matched. Skip them rather than failing the tick.
    if (player && !seen.has(id)) {
      sheeted.push(player);
      seen.add(id);
    }
  }

  const rest = candidates
    .filter((player) => !seen.has(player.id))
    .sort((a, b) => {
      // Absent projection is the worst possible, not zero: an unprojected
      // player must not outrank someone genuinely projected at -2.
      const byProjection =
        (b.projectedPoints ?? Number.NEGATIVE_INFINITY) -
        (a.projectedPoints ?? Number.NEGATIVE_INFINITY);
      if (byProjection !== 0) return byProjection;
      // Total tiebreak. Without it, two equally projected players would be
      // ordered by whatever the database happened to return, and the same
      // draft would replay differently.
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    });

  return [...sheeted, ...rest];
}

/**
 * The pick, or null when nothing in the pool is legal.
 *
 * Null is a real outcome, not an error: a member whose roster is complete has
 * no legal pick, and so does one facing a pool with no player left at an open
 * position. The caller decides what that means — §7 says degradation is a
 * feature, and a worker that finds no legal pick must leave the draft alone for
 * the commissioner rather than write something wrong.
 */
export function selectAutoPick(input: AutoPickInput): EnginePlayer | null {
  const { candidates, cheatSheet, roster, template, takenPlayerIds } = input;

  for (const player of rankForMember(candidates, cheatSheet)) {
    if (isLegalPick({ player, roster, template, takenPlayerIds }).ok) return player;
  }
  return null;
}
