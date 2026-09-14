import { describe, expect, it } from "vitest";

import type { Position } from "@/lib/engine";

import {
  DEFAULT_LINEUP_TEMPLATE,
  FORMATIONS,
  formationName,
  isOfficialFormation,
  lineupSize,
  lineupWeights,
  type LineupSlots,
  type LineupSquadPlayer,
  multipliersOf,
  resolveLineups,
  rolesFromSlots,
  ROLE_MULTIPLIERS,
  slotsFromRoles,
  validateLineup,
} from "./lineup";

/**
 * Thirteen players in the official shape: 5 G, 5 F, 3 C, which is exactly what
 * the roster template drafts.
 */
const SQUAD: LineupSquadPlayer[] = [
  ...(["g1", "g2", "g3", "g4", "g5"] as const).map((playerId) => ({
    playerId,
    position: "G" as Position,
  })),
  ...(["f1", "f2", "f3", "f4", "f5"] as const).map((playerId) => ({
    playerId,
    position: "F" as Position,
  })),
  ...(["c1", "c2", "c3"] as const).map((playerId) => ({
    playerId,
    position: "C" as Position,
  })),
];

/** A legal 2-2-1 with g1 as captain. */
function legal(over: Partial<LineupSlots> = {}): LineupSlots {
  return {
    starters: ["g1", "g2", "f1", "f2", "c1"],
    captain: "g1",
    sixth: ["g3"],
    bench: ["g4", "f3", "f4", "c2"],
    inactive: ["g5", "f5", "c3"],
    ...over,
  };
}

function verdict(slots: LineupSlots, squad = SQUAD) {
  return validateLineup({
    slots,
    template: DEFAULT_LINEUP_TEMPLATE,
    squad,
  });
}

describe("the shape", () => {
  it("has one place per roster slot", () => {
    expect(lineupSize(DEFAULT_LINEUP_TEMPLATE)).toBe(13);
  });

  it("scores the captain double and the inactive three not at all", () => {
    expect(ROLE_MULTIPLIERS.captain).toBe(2);
    expect(ROLE_MULTIPLIERS.starter).toBe(1);
    expect(ROLE_MULTIPLIERS.sixth).toBe(1);
    expect(ROLE_MULTIPLIERS.bench).toBe(0.5);
    expect(ROLE_MULTIPLIERS.inactive).toBe(0);
  });

  it("knows the five official formations and nothing else", () => {
    expect(FORMATIONS.map(formationName)).toEqual([
      "2-2-1",
      "1-2-2",
      "2-1-2",
      "1-3-1",
      "3-1-1",
    ]);
    expect(isOfficialFormation([2, 2, 1])).toBe(true);
    expect(isOfficialFormation([1, 1, 3])).toBe(false);
    expect(isOfficialFormation([3, 2, 0])).toBe(false);
    expect(isOfficialFormation([5, 0, 0])).toBe(false);
  });
});

describe("validateLineup", () => {
  it("accepts every official formation", () => {
    const shapes: Record<string, LineupSlots> = {
      "2-2-1": legal(),
      "1-2-2": legal({
        starters: ["g1", "f1", "f2", "c1", "c2"],
        bench: ["g3", "g4", "f3", "f4"],
        sixth: ["g2"],
        inactive: ["g5", "f5", "c3"],
      }),
      "2-1-2": legal({
        starters: ["g1", "g2", "f1", "c1", "c2"],
        sixth: ["g3"],
        bench: ["g4", "f2", "f3", "f4"],
        inactive: ["g5", "f5", "c3"],
      }),
      "1-3-1": legal({
        starters: ["g1", "f1", "f2", "f3", "c1"],
        sixth: ["g2"],
        bench: ["g3", "g4", "f4", "c2"],
        inactive: ["g5", "f5", "c3"],
      }),
      "3-1-1": legal({
        starters: ["g1", "g2", "g3", "f1", "c1"],
        sixth: ["g4"],
        bench: ["g5", "f2", "f3", "c2"],
        inactive: ["f4", "f5", "c3"],
      }),
    };
    for (const [name, slots] of Object.entries(shapes)) {
      expect(verdict(slots), name).toMatchObject({ ok: true });
    }
  });

  it("refuses a starting five that is not one of the five", () => {
    const result = verdict(
      legal({
        starters: ["g1", "f1", "c1", "c2", "c3"],
        bench: ["g3", "g4", "f3", "f4"],
        sixth: ["g2"],
        inactive: ["g5", "f5", "f2"],
      }),
    );
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("1-1-3");
  });

  it("refuses a captain who is not starting", () => {
    const result = verdict(legal({ captain: "g3" }));
    expect(result).toMatchObject({
      ok: false,
      reason: "The captain has to be one of the starters.",
    });
  });

  it("refuses a lineup with no captain", () => {
    const result = verdict(legal({ captain: "" }));
    expect(result).toMatchObject({ ok: false, reason: "Name a captain." });
  });

  it("refuses the same player in two places", () => {
    const result = verdict(legal({ sixth: ["g1"], bench: ["g3", "f3", "f4", "c2"] }));
    expect(result).toMatchObject({
      ok: false,
      reason: "A player can only hold one place.",
    });
  });

  it("refuses a player who was not on the roster that round", () => {
    const result = verdict(legal({ sixth: ["stranger"] }));
    expect(result).toMatchObject({
      ok: false,
      reason: "That lineup names a player who is not on the roster.",
    });
  });

  it("refuses four starters", () => {
    const result = verdict(
      legal({
        starters: ["g1", "g2", "f1", "f2"],
        bench: ["g4", "f3", "f4", "c2", "c1"],
      }),
    );
    expect(result).toMatchObject({
      ok: false,
      reason: "Name exactly 5 starters.",
    });
  });

  it("refuses leaving somebody on the roster out of the lineup", () => {
    const result = verdict(legal({ inactive: ["g5", "f5"] }));
    expect(result).toMatchObject({
      ok: false,
      reason: "Every player on the roster needs a place in the lineup.",
    });
  });

  it("lets a twelve-man roster leave a place empty, because a drop can", () => {
    const short = SQUAD.filter((player) => player.playerId !== "c3");
    const result = validateLineup({
      slots: legal({ inactive: ["g5", "f5"] }),
      template: DEFAULT_LINEUP_TEMPLATE,
      squad: short,
    });
    expect(result).toMatchObject({ ok: true });
  });

  it("refuses a roster with more players than the lineup has places", () => {
    const long = [
      ...SQUAD,
      { playerId: "c4", position: "C" as Position },
    ];
    const result = validateLineup({
      slots: legal(),
      template: DEFAULT_LINEUP_TEMPLATE,
      squad: long,
    });
    expect(result.ok).toBe(false);
    expect(result.ok === false && result.reason).toContain("14");
  });
});

describe("roles and slots", () => {
  it("round-trips through the form's role-per-player shape", () => {
    const slots = legal();
    const roles = rolesFromSlots(slots);
    expect(roles.get("g1")).toBe("captain");
    expect(roles.get("g2")).toBe("starter");
    expect(roles.get("g3")).toBe("sixth");
    expect(roles.get("c2")).toBe("bench");
    expect(roles.get("c3")).toBe("inactive");

    const rebuilt = slotsFromRoles(
      [...roles].map(([playerId, role]) => ({ playerId, role })),
    );
    expect(rebuilt.captain).toBe("g1");
    expect([...rebuilt.starters].sort()).toEqual([...slots.starters].sort());
    expect(rebuilt.inactive).toEqual(slots.inactive);
  });

  it("puts the captain first among the starters", () => {
    const slots = slotsFromRoles([
      { playerId: "g2", role: "starter" },
      { playerId: "g1", role: "captain" },
    ]);
    expect(slots.starters).toEqual(["g1", "g2"]);
  });
});

describe("multipliers", () => {
  it("gives every named player exactly one multiplier", () => {
    const map = multipliersOf(legal());
    expect(map.get("g1")).toBe(2);
    expect(map.get("g2")).toBe(1);
    expect(map.get("g3")).toBe(1);
    expect(map.get("g4")).toBe(0.5);
    expect(map.get("g5")).toBe(0);
    expect(map.size).toBe(13);
  });
});

describe("resolveLineups", () => {
  const recorded = [{ memberId: "m1", round: 2, slots: legal() }];

  it("carries a lineup forward and leaves earlier rounds absent", () => {
    const rows = resolveLineups({
      recorded,
      rounds: [1, 2, 3],
      memberIds: ["m1"],
    });
    expect(rows.map((row) => [row.round, row.source])).toEqual([
      [1, "absent"],
      [2, "recorded"],
      [3, "carried"],
    ]);
    expect(rows[0].slots).toBeNull();
    expect(rows[2].slots).toEqual(legal());
  });

  it("keeps one member's lineup off another member's rounds", () => {
    const rows = resolveLineups({
      recorded,
      rounds: [3],
      memberIds: ["m1", "m2"],
    });
    expect(rows.find((row) => row.memberId === "m2")?.source).toBe("absent");
  });
});

describe("lineupWeights", () => {
  const weights = lineupWeights(
    resolveLineups({
      recorded: [{ memberId: "m1", round: 2, slots: legal() }],
      rounds: [1, 2, 3],
      memberIds: ["m1"],
    }),
  );

  it("weighs a recorded round by role", () => {
    expect(weights.multiplierFor("m1", 2, "g1")).toBe(2);
    expect(weights.multiplierFor("m1", 2, "g4")).toBe(0.5);
    expect(weights.multiplierFor("m1", 2, "g5")).toBe(0);
  });

  it("scores an absent round at 100%", () => {
    expect(weights.multiplierFor("m1", 1, "g5")).toBe(1);
    expect(weights.sourceFor("m1", 1)).toBe("absent");
  });

  it("scores a player a carried lineup never heard of at 100%", () => {
    expect(weights.multiplierFor("m1", 3, "newcomer")).toBe(1);
    expect(weights.sourceFor("m1", 3)).toBe("carried");
  });

  it("scores a member with no lineups at all at 100%", () => {
    expect(weights.multiplierFor("m2", 2, "g1")).toBe(1);
  });
});
