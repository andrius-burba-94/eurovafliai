import { describe, expect, it } from "vitest";

import {
  CLOCK_TONE,
  CLOCK_VIBRATION,
  clockCue,
  clockSentence,
  cueKey,
  cuesEnabled,
} from "./cues";

/**
 * The one rule this file exists to protect: **a cue fires on the transition
 * into your turn, never on a re-render.**
 *
 * The draft room re-renders on every SSE event — every one of a draft's ~156
 * picks, every pause, every rollback — and each of those re-renders asks
 * `clockCue` the same question again. A cue derived from "am I on the clock
 * right now" would fire on all of them, which is the flood 3.3's critique
 * measured in the pool's live region.
 */

const base = {
  isYourTurn: true,
  overallNo: 7,
  lastFiredFor: null,
  enabled: true,
} as const;

describe("clockCue — when it fires", () => {
  it("fires when your turn arrives", () => {
    expect(clockCue(base)).toEqual({ play: true, announce: true, firedFor: 7 });
  });

  it("fires for a member who arrives already on the clock", () => {
    // `lastFiredFor: null` is a fresh mount. Landing *on* your own turn is the
    // case that most deserves the cue — you have just opened the room to find
    // a clock running on you — so it is not the one to skip.
    expect(clockCue({ ...base, lastFiredFor: null }).announce).toBe(true);
  });

  it("does not fire twice for the same pick", () => {
    // The flood defence, and the reason `lastFiredFor` exists at all.
    expect(clockCue({ ...base, lastFiredFor: 7 })).toEqual({
      play: false,
      announce: false,
      firedFor: null,
    });
  });

  it("says nothing when it is somebody else's turn", () => {
    expect(clockCue({ ...base, isYourTurn: false }).announce).toBe(false);
    // And remembers nothing, so that your *next* turn still fires.
    expect(clockCue({ ...base, isYourTurn: false }).firedFor).toBeNull();
  });

  it("says nothing when nobody is on the clock", () => {
    // A paused or completed draft. `overallNo` is null in both.
    expect(clockCue({ ...base, overallNo: null }).announce).toBe(false);
  });

  it("fires again for the same pick number after it comes back round", () => {
    // A rollback can walk the board back onto a pick you already had — the
    // engine's `computeRollback` re-points the draft, so pick 7 can be on the
    // clock twice in one night. Because a turn that is not yours clears the
    // memory, the second arrival is announced rather than swallowed.
    const yours = clockCue(base);
    expect(yours.firedFor).toBe(7);
    // Somebody else's turn in between clears it...
    const between = clockCue({ ...base, isYourTurn: false, lastFiredFor: 7 });
    expect(between.firedFor).toBeNull();
    // ...so pick 7 coming back to you is told again.
    expect(clockCue({ ...base, lastFiredFor: null }).announce).toBe(true);
  });
});

describe("clockCue — the toggle governs the noise, not the announcement", () => {
  it("stays silent but still announces when cues are off", () => {
    // The live region is an accessibility commitment; the tone is a
    // preference. Somebody who turned the noise off has not asked to stop
    // being told. Getting this backwards would let a preference switch off
    // PRODUCT.md's promise.
    expect(clockCue({ ...base, enabled: false })).toEqual({
      play: false,
      announce: true,
      firedFor: 7,
    });
  });

  it("plays only when switched on", () => {
    expect(clockCue({ ...base, enabled: true }).play).toBe(true);
  });
});

describe("what it says", () => {
  it("names the pick and the round", () => {
    // "You are on the clock" alone makes somebody who is not looking reach for
    // the board to find out where the draft has got to.
    expect(clockSentence(7, 1)).toBe("Your turn. Pick 7, round 1.");
  });

  it("is a whole sentence", () => {
    const line = clockSentence(23, 2);
    expect(line).toMatch(/\.$/);
    expect(line[0]).toBe(line[0]!.toUpperCase());
    expect(line).not.toMatch(/ {2}/);
  });
});

describe("the stored preference", () => {
  it("is off unless it says exactly 'on'", () => {
    // Off is the safe direction for an unrecognised value: a phone that stays
    // unexpectedly quiet is a disappointment, one that unexpectedly makes a
    // noise in a room full of friends is a problem.
    expect(cuesEnabled("on")).toBe(true);
    for (const stored of [null, "", "off", "true", "ON", "1", "yes"]) {
      expect(cuesEnabled(stored), `"${stored}" should be off`).toBe(false);
    }
  });

  it("is keyed per league, because one room may be loud and another quiet", () => {
    expect(cueKey("abc")).toBe("eurovafliai:cues:abc");
    expect(cueKey("abc")).not.toBe(cueKey("def"));
  });
});

describe("the cue's shape", () => {
  it("is two notes a fifth apart, short and quiet", () => {
    // Synthesized rather than an asset — the same argument DESIGN.md makes for
    // icons being drawn rather than imported. Asserted because "a cue, not an
    // alert" is a decision somebody could undo by nudging one number.
    expect(CLOCK_TONE.notes).toHaveLength(2);
    expect(CLOCK_TONE.notes[1]! / CLOCK_TONE.notes[0]!).toBeCloseTo(1.5, 2);
    expect(CLOCK_TONE.noteSeconds).toBeLessThan(0.2);
    expect(CLOCK_TONE.gain).toBeLessThan(0.3);
  });

  it("is a signal rather than a call", () => {
    // Two short buzzes. A long or repeating pattern reads as a phone call.
    expect(CLOCK_VIBRATION).toEqual([90, 70, 90]);
    const total = CLOCK_VIBRATION.reduce((sum, ms) => sum + ms, 0);
    expect(total).toBeLessThan(400);
  });
});
