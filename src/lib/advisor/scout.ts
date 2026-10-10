import type { Position } from "@/lib/engine";

import { MOVE_THRESHOLD, movesWorthMaking } from "./moves";
import type { Confidence, Ruleset } from "./outlook";
import { waiverWire, type StoredOutlook, type WireAgent, type WireRow } from "./wire";

/**
 * One member's Scout page, assembled — slice 7.2 F. Pure.
 *
 * The wire is the league's; the advice reads the viewer's own seats and
 * nobody else's. Free agents are whatever the reader says is signable now, so
 * a player another member signs has left both on the next read.
 */

export type ScoutMove = {
  readonly drop: WireRow;
  readonly add: WireRow;
  readonly gain: number;
  readonly confidence: Confidence;
};

export type ScoutView = {
  readonly wire: WireRow[];
  readonly advice: {
    readonly countsTemplate: boolean;
    /** The viewer's own players: under the template's total is a hole, not a misfiled position. */
    readonly rosterSize: number;
    readonly moves: ScoutMove[];
  };
};

export type ScoutSeat = {
  readonly member: string;
  readonly player: string;
  readonly position: Position;
  readonly name: string;
  readonly clubCode: string;
  readonly status: string;
};

export function scoutFor({
  seats,
  freeAgents,
  outlooks,
  template,
  memberId,
  ruleset,
}: {
  seats: readonly ScoutSeat[];
  freeAgents: readonly WireAgent[];
  outlooks: readonly StoredOutlook[];
  template: Readonly<Record<Position, number>>;
  memberId: string | null;
  ruleset: Ruleset;
}): ScoutView {
  const wire = waiverWire({ freeAgents, outlooks });
  if (!memberId) return { wire, advice: { countsTemplate: true, rosterSize: 0, moves: [] } };

  const mine = waiverWire({
    freeAgents: seats
      .filter((seat) => seat.member === memberId)
      .map((seat) => ({ id: seat.player, name: seat.name, clubCode: seat.clubCode, position: seat.position, status: seat.status })),
    outlooks,
  });
  const rows = new Map([...wire, ...mine].map((row) => [row.id, row]));
  const advice = movesWorthMaking({
    roster: mine.map((row) => ({ id: row.id, position: row.position })),
    template,
    freeAgents: wire,
    outlooks: new Map([...rows].flatMap(([id, row]) => (row.outlook ? [[id, row.outlook] as const] : []))),
    threshold: MOVE_THRESHOLD[ruleset],
  });
  return {
    wire,
    advice: {
      countsTemplate: advice.countsTemplate,
      rosterSize: mine.length,
      moves: advice.moves.map((move) => ({ ...move, drop: rows.get(move.drop)!, add: rows.get(move.add)! })),
    },
  };
}
