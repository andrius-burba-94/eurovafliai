import type { Position } from "@/lib/engine";

import type { Confidence, Ruleset } from "./outlook";
import type { WireOutlook } from "./wire";

/**
 * Moves worth making — slice 7.2 F. Pure: a member's roster, the league's free
 * agents and their outlooks in; at most three drop-and-add pairs out.
 *
 * A pair is legal when the roster still counts the template in the league's
 * own positions, which for a full roster means like for like. The gain is the
 * added player's next-5 outlook minus the dropped player's, plain and per game.
 * Positions are the reader's: it passes each player's position in the league's
 * game, so the Omoruyi case (F in the feed, C in BasketNews) is decided there.
 */

/** In hundredths of the ruleset's points: +3.0 fantasy points, +3.4 Modern (7.2 A research). */
export const MOVE_THRESHOLD: Record<Ruleset, number> = { euroleague: 300, basketnews: 340 };
export const MOVES_SHOWN = 3;

export type MoveInput = {
  readonly roster: readonly { readonly id: string; readonly position: Position }[];
  readonly template: Readonly<Record<Position, number>>;
  readonly freeAgents: readonly { readonly id: string; readonly position: Position; readonly status: string }[];
  readonly outlooks: ReadonlyMap<string, WireOutlook>;
  readonly threshold: number;
};

export type Move = {
  readonly drop: string;
  readonly add: string;
  /** Hundredths a game, next 5. */
  readonly gain: number;
  readonly confidence: Confidence;
};

export type MoveAdvice = {
  /** False: the roster does not count the template in the league's positions, so nothing is suggested. */
  readonly countsTemplate: boolean;
  readonly moves: Move[];
};

const RANK: Record<Confidence, number> = { low: 0, medium: 1, high: 2 };
const lessSure = (a: Confidence, b: Confidence): Confidence => (RANK[a] <= RANK[b] ? a : b);

export function countsTemplate(
  roster: MoveInput["roster"],
  template: MoveInput["template"],
): boolean {
  return (["G", "F", "C"] as const).every(
    (position) => roster.filter((player) => player.position === position).length === template[position],
  );
}

export function movesWorthMaking({ roster, template, freeAgents, outlooks, threshold }: MoveInput): MoveAdvice {
  if (!countsTemplate(roster, template)) return { countsTemplate: false, moves: [] };

  const figure = (id: string) => outlooks.get(id)?.next[0] ?? null;
  const pairs: (Move & { order: number })[] = [];
  roster.forEach((held, dropIndex) => {
    const dropFive = figure(held.id);
    if (dropFive === null) return;
    freeAgents.forEach((agent, addIndex) => {
      if (agent.position !== held.position || agent.status === "injured") return;
      const addFive = figure(agent.id);
      if (addFive === null) return;
      const gain = addFive - dropFive;
      if (gain < threshold) return;
      pairs.push({
        drop: held.id,
        add: agent.id,
        gain,
        confidence: lessSure(outlooks.get(held.id)!.confidence, outlooks.get(agent.id)!.confidence),
        order: dropIndex * freeAgents.length + addIndex,
      });
    });
  });

  pairs.sort((a, b) => b.gain - a.gain || a.order - b.order);
  const dropped = new Set<string>();
  const added = new Set<string>();
  const moves: Move[] = [];
  for (const pair of pairs) {
    if (moves.length === MOVES_SHOWN) break;
    if (dropped.has(pair.drop) || added.has(pair.add)) continue;
    dropped.add(pair.drop);
    added.add(pair.add);
    moves.push({ drop: pair.drop, add: pair.add, gain: pair.gain, confidence: pair.confidence });
  }
  return { countsTemplate: true, moves };
}
