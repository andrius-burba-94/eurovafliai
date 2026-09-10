import { describe, expect, it } from "vitest";

import { isStuckReason, stuckSentence } from "./stuck";

describe("stuckSentence", () => {
  it("names the pick when no legal player is left", () => {
    expect(
      stuckSentence({ reason: "no_legal_player", pickNo: 7 }),
    ).toBe(
      "The draft is stuck at pick 7: no legal player is left in the pool. Pause, fix the pool or the roster template, then resume.",
    );
  });

  it("still makes sense without a pick number", () => {
    expect(stuckSentence({ reason: "no_legal_player" })).toBe(
      "The draft is stuck: no legal player is left in the pool. Pause, fix the pool or the roster template, then resume.",
    );
  });

  it("tells the commissioner to repair a board hole", () => {
    expect(stuckSentence({ reason: "board_hole" })).toBe(
      "The draft is stuck: there is a gap in the board and nobody is on the clock. Pause, repair the picks, then resume.",
    );
  });

  it("points at the worker logs for a repeated failure", () => {
    expect(stuckSentence({ reason: "repeated_failure" })).toBe(
      "The draft is stuck: the worker failed on this draft several times in a row. Check the worker logs, then pause and resume once it is fixed.",
    );
  });

  it("rejects an unknown reason code", () => {
    expect(isStuckReason("no_legal_player")).toBe(true);
    expect(isStuckReason("something_else")).toBe(false);
  });
});
