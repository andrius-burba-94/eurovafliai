import { describe, expect, it } from "vitest";

import { STALLED_SENTENCE, pickHasStalled } from "./stalled";

const MAX = 5;

describe("pickHasStalled", () => {
  it("is quiet before the clock has been read", () => {
    // The first paint has no countdown. A notice on the first frame of every
    // turn would cry wolf 156 times a night.
    expect(
      pickHasStalled({ remainingMs: null, pullsSpent: MAX, maxPulls: MAX }),
    ).toBe(false);
  });

  it("is quiet while there is time left", () => {
    expect(
      pickHasStalled({ remainingMs: 45_000, pullsSpent: 0, maxPulls: MAX }),
    ).toBe(false);
    expect(
      pickHasStalled({ remainingMs: 1, pullsSpent: MAX, maxPulls: MAX }),
    ).toBe(false);
  });

  // The normal, healthy expiry: the clock hits zero and the worker takes the
  // pick a second later. The room must not accuse anything during that second.
  it("is quiet past zero while the room still has pulls to spend", () => {
    expect(
      pickHasStalled({ remainingMs: -500, pullsSpent: 0, maxPulls: MAX }),
    ).toBe(false);
    expect(
      pickHasStalled({ remainingMs: -9_000, pullsSpent: 4, maxPulls: MAX }),
    ).toBe(false);
  });

  it("speaks once the pulls are spent and the pick has not moved", () => {
    expect(
      pickHasStalled({ remainingMs: -15_000, pullsSpent: MAX, maxPulls: MAX }),
    ).toBe(true);
    expect(
      pickHasStalled({ remainingMs: -600_000, pullsSpent: 9, maxPulls: MAX }),
    ).toBe(true);
  });

  it("treats exactly zero as expired", () => {
    expect(
      pickHasStalled({ remainingMs: 0, pullsSpent: MAX, maxPulls: MAX }),
    ).toBe(true);
  });
});

describe("STALLED_SENTENCE", () => {
  // The module's own rule: a slow box, a paused worker and a crashed worker
  // are indistinguishable from the browser, so the notice names a symptom and
  // offers the ways out rather than diagnosing.
  it("names the symptom and both ways out", () => {
    expect(STALLED_SENTENCE).toMatch(/clock ran out/i);
    expect(STALLED_SENTENCE).toMatch(/pick by hand/i);
    expect(STALLED_SENTENCE).toMatch(/start the worker/i);
  });

  it("does not assert a cause it cannot know", () => {
    expect(STALLED_SENTENCE).not.toMatch(/worker is down/i);
    expect(STALLED_SENTENCE).not.toMatch(/crashed/i);
    expect(STALLED_SENTENCE).toMatch(/may not be running/i);
  });
});
