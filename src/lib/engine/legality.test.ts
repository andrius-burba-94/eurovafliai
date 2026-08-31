import { describe, expect, it } from "vitest";

import { countByPosition, isLegalPick, openPositions } from "./legality";
import type { Position, RosterTemplate } from "./types";

/** The league default: 5 guards, 5 forwards, 3 centers = 13. */
const TEMPLATE: RosterTemplate = { G: 5, F: 5, C: 3 };

/** A roster of the given shape, ignoring who the players actually are. */
const roster = (g: number, f: number, c: number): { position: Position }[] => [
  ...Array.from({ length: g }, () => ({ position: "G" as const })),
  ...Array.from({ length: f }, () => ({ position: "F" as const })),
  ...Array.from({ length: c }, () => ({ position: "C" as const })),
];

const player = (id: string, position: Position) => ({ id, position });
const none = new Set<string>();

const legal = (input: Parameters<typeof isLegalPick>[0]) => isLegalPick(input).ok;

describe("countByPosition", () => {
  it("counts an empty roster as zeroes", () => {
    expect(countByPosition([])).toEqual({ G: 0, F: 0, C: 0 });
  });

  it("counts a mixed roster", () => {
    expect(countByPosition(roster(2, 3, 1))).toEqual({ G: 2, F: 3, C: 1 });
  });
});

describe("openPositions", () => {
  it("is everything for an empty roster", () => {
    expect(openPositions([], TEMPLATE)).toEqual(["G", "F", "C"]);
  });

  it("drops a position once it is full", () => {
    expect(openPositions(roster(5, 0, 0), TEMPLATE)).toEqual(["F", "C"]);
    expect(openPositions(roster(5, 5, 0), TEMPLATE)).toEqual(["C"]);
  });

  it("is empty for a complete roster", () => {
    expect(openPositions(roster(5, 5, 3), TEMPLATE)).toEqual([]);
  });

  it("follows the template rather than assuming 5/5/3", () => {
    const small: RosterTemplate = { G: 1, F: 1, C: 0 };
    // C is closed from the start when the template asks for none.
    expect(openPositions([], small)).toEqual(["G", "F"]);
    expect(openPositions(roster(1, 0, 0), small)).toEqual(["F"]);
  });
});

describe("isLegalPick — availability", () => {
  it("allows an available player", () => {
    expect(legal({ player: player("p1", "G"), roster: [], template: TEMPLATE, takenPlayerIds: none }))
      .toBe(true);
  });

  it("refuses a player somebody already took", () => {
    const verdict = isLegalPick({
      player: player("p1", "G"),
      roster: [],
      template: TEMPLATE,
      takenPlayerIds: new Set(["p1"]),
    });
    expect(verdict).toEqual({ ok: false, reason: "That player is already drafted." });
  });

  it("checks availability against the whole draft, not just your own roster", () => {
    // The player is on somebody else's roster, so `roster` here is empty and
    // only `takenPlayerIds` knows. This is the double-pick case.
    expect(
      legal({
        player: player("p9", "C"),
        roster: roster(1, 1, 0),
        template: TEMPLATE,
        takenPlayerIds: new Set(["p9"]),
      }),
    ).toBe(false);
  });
});

describe("isLegalPick — positional caps", () => {
  it("allows a position with room left", () => {
    expect(
      legal({
        player: player("p1", "G"),
        roster: roster(4, 0, 0),
        template: TEMPLATE,
        takenPlayerIds: none,
      }),
    ).toBe(true);
  });

  it("refuses a position that is full", () => {
    const verdict = isLegalPick({
      player: player("p1", "G"),
      roster: roster(5, 0, 0),
      template: TEMPLATE,
      takenPlayerIds: none,
    });
    expect(verdict.ok).toBe(false);
    if (!verdict.ok) {
      expect(verdict.reason).toContain("Gs");
      // The message says what IS still open, because that is the next question.
      expect(verdict.reason).toContain("F, C");
    }
  });

  it("refuses a sixth guard even when the roster has room overall", () => {
    // The failure a total-count-only check would allow: 5 G + 2 F is 7 of 13,
    // so there is space — but not for another guard.
    expect(
      legal({
        player: player("p1", "G"),
        roster: roster(5, 2, 0),
        template: TEMPLATE,
        takenPlayerIds: none,
      }),
    ).toBe(false);
  });
});

describe("isLegalPick — the endgame", () => {
  it("makes ONLY centers legal when only C slots remain", () => {
    // §6 of the invariants, verbatim: 5 G and 5 F taken, 2 C to go.
    const nearlyDone = roster(5, 5, 1);
    expect(
      legal({ player: player("g", "G"), roster: nearlyDone, template: TEMPLATE, takenPlayerIds: none }),
    ).toBe(false);
    expect(
      legal({ player: player("f", "F"), roster: nearlyDone, template: TEMPLATE, takenPlayerIds: none }),
    ).toBe(false);
    expect(
      legal({ player: player("c", "C"), roster: nearlyDone, template: TEMPLATE, takenPlayerIds: none }),
    ).toBe(true);
  });

  it("makes the very last slot legal for exactly one position", () => {
    const twelve = roster(5, 5, 2); // 12 of 13
    expect(openPositions(twelve, TEMPLATE)).toEqual(["C"]);
    expect(
      legal({ player: player("c", "C"), roster: twelve, template: TEMPLATE, takenPlayerIds: none }),
    ).toBe(true);
  });

  it("refuses everything once the roster is complete", () => {
    const full = roster(5, 5, 3);
    for (const position of ["G", "F", "C"] as const) {
      const verdict = isLegalPick({
        player: player("x", position),
        roster: full,
        template: TEMPLATE,
        takenPlayerIds: none,
      });
      expect(verdict).toEqual({ ok: false, reason: "Your roster is full." });
    }
  });

  it("says 'full' rather than naming open positions when there are none", () => {
    // Guards against a message like "still open: " with nothing after it.
    const verdict = isLegalPick({
      player: player("x", "C"),
      roster: roster(5, 5, 3),
      template: TEMPLATE,
      takenPlayerIds: none,
    });
    if (!verdict.ok) expect(verdict.reason).not.toContain("Still open");
  });
});

describe("isLegalPick — the template is a setting", () => {
  it("honours a template that wants no centers at all", () => {
    const noCenters: RosterTemplate = { G: 2, F: 2, C: 0 };
    expect(
      legal({ player: player("c", "C"), roster: [], template: noCenters, takenPlayerIds: none }),
    ).toBe(false);
    expect(
      legal({ player: player("g", "G"), roster: [], template: noCenters, takenPlayerIds: none }),
    ).toBe(true);
  });

  it("honours an 11-man template, the case blueprint §10 leaves open", () => {
    const eleven: RosterTemplate = { G: 4, F: 4, C: 3 };
    expect(
      legal({ player: player("g", "G"), roster: roster(4, 0, 0), template: eleven, takenPlayerIds: none }),
    ).toBe(false);
    // The same roster would be legal under the 5/5/3 default, which is exactly
    // why nothing may hardcode it.
    expect(
      legal({ player: player("g", "G"), roster: roster(4, 0, 0), template: TEMPLATE, takenPlayerIds: none }),
    ).toBe(true);
  });
});
