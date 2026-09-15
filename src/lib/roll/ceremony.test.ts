import { describe, expect, it } from "vitest";

import {
  COUNTDOWN_MS,
  STEP_MS,
  ceremonyDurationMs,
  isDrawn,
  rollCeremony,
} from "./ceremony";

const ROLLED = 1_800_000_000_000;

/** The ceremony as it would be seen `ms` after the roll landed. */
const at = (ms: number, slots = 3) =>
  rollCeremony({ rolledAt: ROLLED, now: ROLLED + ms, slots });

describe("rollCeremony", () => {
  it("is nothing at all before a roll", () => {
    expect(rollCeremony({ rolledAt: null, now: ROLLED, slots: 3 }).phase).toBe(
      "none",
    );
    expect(rollCeremony({ rolledAt: 0, now: ROLLED, slots: 3 }).phase).toBe(
      "none",
    );
  });

  // A rolled seed with nobody positioned is the half-written roll 2.3a's
  // failure-recovery story describes. There is no ceremony to run for it.
  it("is nothing when no member has a position", () => {
    expect(rollCeremony({ rolledAt: ROLLED, now: ROLLED, slots: 0 }).phase).toBe(
      "none",
    );
  });

  it("counts ten down to one, and never shows zero", () => {
    expect(at(0).secondsLeft).toBe(10);
    expect(at(1).secondsLeft).toBe(10);
    expect(at(1_000).secondsLeft).toBe(9);
    expect(at(9_000).secondsLeft).toBe(1);
    expect(at(COUNTDOWN_MS - 1).secondsLeft).toBe(1);
    expect(at(0).phase).toBe("countdown");
    expect(at(COUNTDOWN_MS - 1).phase).toBe("countdown");
  });

  it("draws nothing while it is still counting", () => {
    expect(at(5_000).revealedCount).toBe(0);
    expect(at(5_000).landed).toBe(0);
  });

  // The whole shape of the reveal: last slot first, first pick last.
  it("lands the last slot the instant the countdown ends", () => {
    const first = at(COUNTDOWN_MS);
    expect(first.phase).toBe("revealing");
    expect(first.revealedCount).toBe(1);
    expect(first.landed).toBe(3);
  });

  it("walks down one slot every three seconds", () => {
    expect(at(COUNTDOWN_MS + STEP_MS).landed).toBe(2);
    expect(at(COUNTDOWN_MS + STEP_MS).revealedCount).toBe(2);
    expect(at(COUNTDOWN_MS + 2 * STEP_MS).landed).toBe(1);
    expect(at(COUNTDOWN_MS + 2 * STEP_MS).revealedCount).toBe(3);
  });

  // The final slot keeps the announcer for its own three seconds before the
  // page settles into "picks first" — the beat the ceremony is built for.
  it("is still revealing during the first pick's own three seconds", () => {
    const last = at(COUNTDOWN_MS + 2 * STEP_MS + 1);
    expect(last.phase).toBe("revealing");
    expect(last.landed).toBe(1);
    expect(last.live).toBe(true);
  });

  it("completes only after the last slot has had its turn", () => {
    expect(at(COUNTDOWN_MS + 3 * STEP_MS - 1).phase).toBe("revealing");
    expect(at(COUNTDOWN_MS + 3 * STEP_MS).phase).toBe("complete");
    expect(at(COUNTDOWN_MS + 3 * STEP_MS).revealedCount).toBe(3);
    expect(at(COUNTDOWN_MS + 3 * STEP_MS).landed).toBe(1);
  });

  // Somebody opening the page an hour later reads the order; they are not shown
  // a countdown for an event that is over.
  it("shows a long-finished roll as complete, not as a countdown", () => {
    const later = at(60 * 60 * 1000);
    expect(later.phase).toBe("complete");
    expect(later.revealedCount).toBe(3);
    expect(later.live).toBe(false);
  });

  it("is live exactly while it is running", () => {
    expect(at(0).live).toBe(true);
    expect(at(COUNTDOWN_MS).live).toBe(true);
    expect(at(COUNTDOWN_MS + 3 * STEP_MS).live).toBe(false);
  });

  // A phone whose clock runs behind the server's must not compute a negative
  // elapsed and index a slot that does not exist.
  it("clamps a clock that runs behind the server to the start", () => {
    const skewed = rollCeremony({
      rolledAt: ROLLED,
      now: ROLLED - 30_000,
      slots: 3,
    });
    expect(skewed.phase).toBe("countdown");
    expect(skewed.secondsLeft).toBe(10);
    expect(skewed.landed).toBe(0);
  });

  it("holds for a full twelve-member league", () => {
    expect(at(COUNTDOWN_MS, 12).landed).toBe(12);
    expect(at(COUNTDOWN_MS + 11 * STEP_MS, 12).landed).toBe(1);
    expect(at(COUNTDOWN_MS + 11 * STEP_MS, 12).revealedCount).toBe(12);
    expect(at(COUNTDOWN_MS + 12 * STEP_MS, 12).phase).toBe("complete");
  });

  it("holds for the smallest league that can draft", () => {
    expect(at(COUNTDOWN_MS, 2).landed).toBe(2);
    expect(at(COUNTDOWN_MS + STEP_MS, 2).landed).toBe(1);
    expect(at(COUNTDOWN_MS + 2 * STEP_MS, 2).phase).toBe("complete");
  });
});

describe("isDrawn", () => {
  // Reveal runs downward, so "drawn" is a position at or below the frontier.
  it("reveals from the last slot upward", () => {
    const three = { slots: 3, revealedCount: 1 };
    expect(isDrawn(3, three)).toBe(true);
    expect(isDrawn(2, three)).toBe(false);
    expect(isDrawn(1, three)).toBe(false);
  });

  it("has everything drawn once every slot has landed", () => {
    const all = { slots: 3, revealedCount: 3 };
    expect(isDrawn(1, all)).toBe(true);
    expect(isDrawn(2, all)).toBe(true);
    expect(isDrawn(3, all)).toBe(true);
  });

  it("has nothing drawn before the first slot lands", () => {
    const none = { slots: 3, revealedCount: 0 };
    expect(isDrawn(1, none)).toBe(false);
    expect(isDrawn(3, none)).toBe(false);
  });
});

describe("ceremonyDurationMs", () => {
  it("is the countdown plus three seconds a slot", () => {
    expect(ceremonyDurationMs(3)).toBe(COUNTDOWN_MS + 3 * STEP_MS);
    expect(ceremonyDurationMs(12)).toBe(COUNTDOWN_MS + 12 * STEP_MS);
  });

  it("is nothing for a league with no order", () => {
    expect(ceremonyDurationMs(0)).toBe(0);
  });
});
