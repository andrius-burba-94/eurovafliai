import { describe, expect, it } from "vitest";

import { buildRadar, type RadarPick } from "./radar";
import type { Position, RosterTemplate } from "./types";

/**
 * The roster radar — slice 3.2.
 *
 * The template is a rule read from league settings, so the cases worth covering
 * are the ones where a radar that had quietly assumed 5/5/3 would be wrong: a
 * different template, a bucket that is full while others are empty, and a
 * surplus pick that must be *shown* rather than dropped.
 */

const TEMPLATE: RosterTemplate = { G: 5, F: 5, C: 3 };

let nextPick = 0;
const pick = (position: Position, overallNo?: number): RadarPick => {
  nextPick += 1;
  return {
    overallNo: overallNo ?? nextPick,
    playerId: `p${overallNo ?? nextPick}`,
    position,
  };
};

const row = (picks: RadarPick[], template = TEMPLATE) =>
  buildRadar([{ memberId: "m1", picks }], template)[0]!;

/** A row's slots as a compact string: "G" filled, "g" empty. */
const shape = (
  slots: readonly { position: Position; overallNo: number | null }[],
) =>
  slots
    .map((slot) =>
      slot.overallNo === null ? slot.position.toLowerCase() : slot.position,
    )
    .join("");

describe("buildRadar — the empty roster", () => {
  it("draws every slot the template asks for, all waiting", () => {
    const radar = row([]);
    expect(radar.slots).toHaveLength(13);
    expect(shape(radar.slots)).toBe("gggggfffffccc");
    expect(radar.filled).toBe(0);
    expect(radar.needs).toEqual({ G: 5, F: 5, C: 3 });
    expect(radar.overflow).toEqual([]);
  });

  it("orders the slots guards, forwards, centers", () => {
    // The room reads a row left to right and expects the template's own order,
    // not the order picks happened to arrive in.
    const radar = row([pick("C", 1), pick("F", 2), pick("G", 3)]);
    expect(shape(radar.slots)).toBe("GggggFffffCcc");
  });
});

describe("buildRadar — filling up", () => {
  it("fills a bucket in pick order, so the third guard is the third taken", () => {
    const radar = row([pick("G", 9), pick("G", 2), pick("G", 5)]);
    const guards = radar.slots.filter((slot) => slot.position === "G");
    expect(guards.slice(0, 3).map((slot) => slot.overallNo)).toEqual([2, 5, 9]);
    // And a rollback takes the last one, rather than reshuffling the row.
    expect(guards[2]!.overallNo).toBe(9);
  });

  it("counts what is filled and what is still needed", () => {
    const radar = row([pick("G", 1), pick("G", 2), pick("C", 3)]);
    expect(radar.filled).toBe(3);
    expect(radar.needs).toEqual({ G: 3, F: 5, C: 2 });
  });

  it("reports a full bucket beside empty ones", () => {
    // The case the room actually asks about: somebody is done at center and
    // still has eight slots to fill.
    const radar = row([pick("C", 1), pick("C", 2), pick("C", 3)]);
    expect(radar.needs).toEqual({ G: 5, F: 5, C: 0 });
    expect(shape(radar.slots)).toBe("gggggfffffCCC");
  });

  it("reports a finished roster as finished", () => {
    const picks = [
      ...Array.from({ length: 5 }, (_, i) => pick("G", i + 1)),
      ...Array.from({ length: 5 }, (_, i) => pick("F", i + 6)),
      ...Array.from({ length: 3 }, (_, i) => pick("C", i + 11)),
    ];
    const radar = row(picks);
    expect(radar.filled).toBe(13);
    expect(radar.needs).toEqual({ G: 0, F: 0, C: 0 });
    expect(radar.overflow).toEqual([]);
    expect(shape(radar.slots)).toBe("GGGGGFFFFFCCC");
  });
});

describe("buildRadar — a template that is not 5/5/3", () => {
  it("follows the template it is given", () => {
    // The blueprint leaves open whether a twelve-member league drops to
    // eleven-man rosters, so this must not be 5/5/3 in disguise.
    const eleven: RosterTemplate = { G: 4, F: 4, C: 3 };
    const radar = row([pick("G", 1)], eleven);
    expect(radar.slots).toHaveLength(11);
    expect(shape(radar.slots)).toBe("Ggggffffccc");
    expect(radar.needs).toEqual({ G: 3, F: 4, C: 3 });
  });

  it("handles a template with no room for a position at all", () => {
    const noCentres: RosterTemplate = { G: 7, F: 6, C: 0 };
    const radar = row([], noCentres);
    expect(radar.slots).toHaveLength(13);
    expect(radar.slots.some((slot) => slot.position === "C")).toBe(false);
    expect(radar.needs.C).toBe(0);
  });
});

describe("buildRadar — the surplus that should never exist", () => {
  it("shows a pick that does not fit rather than dropping it", () => {
    // `isLegalPick` refuses this and every write path re-checks it, so a fourth
    // center means the referee failed. A radar that drew thirteen slots and
    // silently discarded the fourteenth pick would hide exactly that.
    const radar = row([pick("C", 1), pick("C", 2), pick("C", 3), pick("C", 4)]);
    expect(radar.slots.filter((slot) => slot.position === "C")).toHaveLength(3);
    expect(radar.overflow).toHaveLength(1);
    expect(radar.overflow[0]!.overallNo).toBe(4);
    // The needs cannot go negative just because a bucket overflowed.
    expect(radar.needs.C).toBe(0);
  });

  it("never counts a surplus as filled", () => {
    const radar = row([pick("C", 1), pick("C", 2), pick("C", 3), pick("C", 4)]);
    expect(radar.filled).toBe(3);
  });
});

describe("buildRadar — the whole league", () => {
  it("returns one row per member, in the order given", () => {
    const radar = buildRadar(
      [
        { memberId: "b", picks: [pick("G", 1)] },
        { memberId: "a", picks: [] },
        { memberId: "c", picks: [pick("C", 2), pick("C", 3)] },
      ],
      TEMPLATE,
    );
    // Draft order, not alphabetical: the radar reads down the same order the
    // board reads across.
    expect(radar.map((one) => one.memberId)).toEqual(["b", "a", "c"]);
    expect(radar[0]!.filled).toBe(1);
    expect(radar[1]!.filled).toBe(0);
    expect(radar[2]!.needs.C).toBe(1);
  });

  it("gives a member with no picks a full set of waiting slots", () => {
    const radar = buildRadar([{ memberId: "solo", picks: [] }], TEMPLATE);
    expect(radar[0]!.slots).toHaveLength(13);
    expect(radar[0]!.slots.every((slot) => slot.overallNo === null)).toBe(true);
  });

  it("is empty for an empty league rather than throwing", () => {
    // Unlike `buildPickOrder`, an empty list here is a legitimate render: the
    // lobby has members before a draft has an order.
    expect(buildRadar([], TEMPLATE)).toEqual([]);
  });
});
