import { describe, expect, it } from "vitest";

import { orderAlreadyApplied } from "./order";

describe("orderAlreadyApplied", () => {
  it("is false on a first roll, when nobody has a position yet", () => {
    expect(
      orderAlreadyApplied(["a", "b"], [{ id: "a" }, { id: "b" }]),
    ).toBe(false);
  });

  it("is true when every member already carries the number this order gives", () => {
    expect(
      orderAlreadyApplied(
        ["b", "a"],
        [
          { id: "a", draft_position: 2 },
          { id: "b", draft_position: 1 },
        ],
      ),
    ).toBe(true);
  });

  it("is false when the order differs from the stored one", () => {
    expect(
      orderAlreadyApplied(
        ["a", "b"],
        [
          { id: "a", draft_position: 2 },
          { id: "b", draft_position: 1 },
        ],
      ),
    ).toBe(false);
  });

  // The repair path: re-applying after a half-saved roll really does move the
  // board, so it must not be treated as a silent replay.
  it("is false when only some members saved their position", () => {
    expect(
      orderAlreadyApplied(
        ["a", "b", "c"],
        [{ id: "a", draft_position: 1 }, { id: "b" }, { id: "c" }],
      ),
    ).toBe(false);
  });

  it("is false when a member's number is off by one", () => {
    expect(
      orderAlreadyApplied(
        ["a", "b"],
        [
          { id: "a", draft_position: 1 },
          { id: "b", draft_position: 3 },
        ],
      ),
    ).toBe(false);
  });

  it("is false when a member in the order has no stored row at all", () => {
    expect(orderAlreadyApplied(["a", "b"], [{ id: "a", draft_position: 1 }])).toBe(
      false,
    );
  });

  it("is false for an empty order, so a real draw is never hidden", () => {
    expect(orderAlreadyApplied([], [])).toBe(false);
  });

  // Positions are 1-based; a stored 0 is not "first".
  it("does not accept a zero position as the first slot", () => {
    expect(orderAlreadyApplied(["a"], [{ id: "a", draft_position: 0 }])).toBe(
      false,
    );
  });

  it("holds for a three-member order in full", () => {
    expect(
      orderAlreadyApplied(
        ["c", "a", "b"],
        [
          { id: "a", draft_position: 2 },
          { id: "b", draft_position: 3 },
          { id: "c", draft_position: 1 },
        ],
      ),
    ).toBe(true);
  });
});
