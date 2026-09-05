import { countByPosition } from "./legality";
import { rosterSize, type Position, type RosterTemplate } from "./types";

/**
 * The roster radar — slice 3.2.
 *
 * What every member still needs, laid out as the template they are filling:
 * five guard slots, five forward slots, three centre slots, each either holding
 * a pick or waiting for one. `legality.ts` answers "may this member take this
 * player"; this answers the question the room asks out loud all evening —
 * *who still needs a centre* — which is the same arithmetic seen from the
 * roster's side instead of the pick's.
 *
 * Pure, and in the engine rather than in the view, because the template is a
 * rule: it comes from `leagues.settings.roster_template`, never hardcoded, and
 * the blueprint leaves open whether a twelve-member league drops to eleven-man
 * rosters. A radar that assumed 5/5/3 would be a second place that had to be
 * corrected when that decision lands.
 *
 * ## Why there is an overflow
 *
 * There should never be one. `isLegalPick` refuses a pick into a full bucket,
 * and every write path re-checks it. But a radar that filled thirteen slots and
 * quietly dropped a fourteenth pick would *hide* the one state that would mean
 * the referee had failed — so a surplus is returned rather than discarded, and
 * the room can draw it as the correction it would be. Loud beats a plausible
 * picture.
 */

/** One place on a member's roster. */
export type RadarSlot = {
  readonly position: Position;
  /** 1-based index within this position's run — "the third guard". */
  readonly index: number;
  /** The pick filling it, or null while it waits. */
  readonly overallNo: number | null;
  readonly playerId: string | null;
};

export type RadarRow = {
  readonly memberId: string;
  /**
   * Template-ordered: every guard slot, then every forward, then every centre.
   * Always `rosterSize(template)` long, however few picks the member has.
   */
  readonly slots: readonly RadarSlot[];
  /** How many of each bucket is still open — "needs 1 C, 2 F". */
  readonly needs: Record<Position, number>;
  /** Filled slots over total. The room's one-glance number. */
  readonly filled: number;
  /**
   * Picks that did not fit the template. Always empty in a correct draft; see
   * the note above for why they are returned instead of dropped.
   */
  readonly overflow: readonly RadarSlot[];
};

/** As much of a pick as the radar needs. */
export type RadarPick = {
  readonly overallNo: number;
  readonly playerId: string;
  readonly position: Position;
};

const ORDER: readonly Position[] = ["G", "F", "C"];

/**
 * One row per member, in the order given.
 *
 * Callers pass members in draft order, so the radar reads down the same order
 * the board reads across. Picks are placed in `overall_no` order within their
 * bucket, so "the third guard" is genuinely the third guard taken and a
 * rollback removes the last one rather than reshuffling the row.
 */
export function buildRadar(
  rosters: readonly {
    readonly memberId: string;
    readonly picks: readonly RadarPick[];
  }[],
  template: RosterTemplate,
): RadarRow[] {
  return rosters.map(({ memberId, picks }) => {
    const byPosition = new Map<Position, RadarPick[]>(
      ORDER.map((position) => [
        position,
        picks
          .filter((pick) => pick.position === position)
          .sort((a, b) => a.overallNo - b.overallNo),
      ]),
    );

    const slots: RadarSlot[] = [];
    const overflow: RadarSlot[] = [];

    for (const position of ORDER) {
      const taken = byPosition.get(position) ?? [];
      for (let index = 0; index < template[position]; index += 1) {
        const pick = taken[index];
        slots.push({
          position,
          index: index + 1,
          overallNo: pick?.overallNo ?? null,
          playerId: pick?.playerId ?? null,
        });
      }
      // Anything past the template's room for this bucket.
      for (const pick of taken.slice(template[position])) {
        overflow.push({
          position,
          index: overflow.length + 1,
          overallNo: pick.overallNo,
          playerId: pick.playerId,
        });
      }
    }

    const counts = countByPosition(picks);
    return {
      memberId,
      slots,
      needs: {
        G: Math.max(template.G - counts.G, 0),
        F: Math.max(template.F - counts.F, 0),
        C: Math.max(template.C - counts.C, 0),
      },
      filled: slots.filter((slot) => slot.overallNo !== null).length,
      overflow,
    };
  });
}

/** Total slots on a radar row, for the room's "7 of 13". */
export function radarSize(template: RosterTemplate): number {
  return rosterSize(template);
}
