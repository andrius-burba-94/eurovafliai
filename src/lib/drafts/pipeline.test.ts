import { describe, expect, it } from "vitest";

import { deadlineFrom, describeError, isUniqueViolation, toState } from "./pipeline";
import type { DraftRecord } from "./types";

/**
 * The pipeline's small print.
 *
 * Everything else in this module talks to PocketBase and is tested through the
 * sweep's fake and the E2E spec. These four are pure, and two of them are
 * load-bearing in a way that is easy to miss: `isUniqueViolation` decides
 * whether a failed write is reported as "somebody got there first" or thrown,
 * so a wrong answer either swallows a real error or turns a lost race into a
 * crash. It is asserted against the shape PocketBase 0.39 really sends.
 */

const draft: DraftRecord = {
  id: "d1",
  league: "lg1",
  format: "snake",
  status: "live",
  order: ["m1", "m2"],
  rounds: 13,
  current_pick: 4,
  deadline: "2026-09-02 19:00:00.000Z",
  pick_seconds: 60,
  seed: "seed",
};

describe("deadlineFrom", () => {
  it("writes the space-separated form PocketBase stores", () => {
    expect(deadlineFrom(new Date("2026-09-02T19:00:00.000Z"), 60)).toBe(
      "2026-09-02 19:01:00.000Z",
    );
  });
});

describe("toState", () => {
  it("hands the engine only what the engine is allowed to know", () => {
    expect(toState(draft)).toEqual({
      format: "snake",
      memberIds: ["m1", "m2"],
      rounds: 13,
      currentPick: 4,
      status: "live",
    });
  });
});

describe("isUniqueViolation", () => {
  it("recognises the code PocketBase sends for a duplicate", () => {
    expect(
      isUniqueViolation({
        status: 400,
        response: {
          data: {
            overall_no: { code: "validation_not_unique", message: "Value must be unique." },
          },
        },
      }),
    ).toBe(true);
  });

  it("does not read some other validation failure as a lost race", () => {
    // The failure mode this guards: swallowing a genuine error as "somebody
    // else already did it" and telling the member their pick simply lost.
    expect(
      isUniqueViolation({
        status: 400,
        response: { data: { player: { code: "validation_required" } } },
      }),
    ).toBe(false);
    expect(isUniqueViolation(new Error("ECONNREFUSED"))).toBe(false);
    expect(isUniqueViolation({ status: 403, response: {} })).toBe(false);
    expect(isUniqueViolation(null)).toBe(false);
  });
});

describe("describeError", () => {
  it("digs out the detail PocketBase hides behind a generic message", () => {
    expect(
      describeError(
        Object.assign(new Error("Something went wrong."), {
          response: { data: { deadline: { message: "Invalid date." } } },
        }),
      ),
    ).toBe("Something went wrong. (deadline: Invalid date.)");
  });

  it("still says something useful about an ordinary error", () => {
    expect(describeError(new Error("socket hang up"))).toBe("socket hang up");
    expect(describeError("nope")).toBe("nope");
  });
});
