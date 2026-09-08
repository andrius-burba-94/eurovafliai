"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";

import {
  CLOCK_TONE,
  CLOCK_VIBRATION,
  clockCue,
  clockSentence,
  cueKey,
  cuesEnabled,
} from "@/lib/cues/cues";

/**
 * "You are on the clock", made perceivable without looking at the screen.
 *
 * PRODUCT.md has promised this since 2.6 — "announced to assistive tech via a
 * live region, with sound and vibration cues" — and **none of the three
 * existed**. It is the oldest unmet product commitment in the repo, and three
 * slices have chipped at the edges of it: the board's marked slot says "on the
 * clock" in an `sr-only` span, the pool announces its match count, the radar
 * names the member on the clock. The *banner*, which is the one that matters,
 * said nothing out loud.
 *
 * ## The announcement and the noise are different promises
 *
 * The live region fires whenever your turn arrives, **whether or not cues are
 * switched on**: it is an accessibility commitment, and somebody who turned the
 * noise off has not asked to stop being told. The tone and the buzz are a
 * preference, off until asked for, because a phone that makes a noise nobody
 * chose — on a couch full of friends, with a television on — is worse than
 * silence. `clockCue` draws that line and `cues.test.ts` asserts it, because
 * getting it backwards would let a preference switch off a promise.
 *
 * ## Why the tone is synthesized
 *
 * Two short notes a fifth apart, built with `AudioContext` rather than shipped
 * as a file. Same argument DESIGN.md makes for icons being drawn rather than
 * imported: no package, no asset, one recipe. It is deliberately not a rising
 * alarm — the cue's job is "it is you", not "something is wrong".
 */

const listeners = new Set<() => void>();

function subscribeCues(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

function readCues(leagueId: string): string | null {
  try {
    return window.localStorage.getItem(cueKey(leagueId));
  } catch {
    return null;
  }
}

function writeCues(leagueId: string, on: boolean): void {
  try {
    window.localStorage.setItem(cueKey(leagueId), on ? "on" : "off");
  } catch {
    // Storage denied. The toggle still works for this page's lifetime.
  }
  for (const listener of listeners) listener();
}

export function ClockCue({
  leagueId,
  isYourTurn,
  overallNo,
  round,
}: {
  leagueId: string;
  isYourTurn: boolean;
  /** Null when nobody is on the clock — paused, or complete. */
  overallNo: number | null;
  round: number | null;
}) {
  /**
   * Read through `useSyncExternalStore`, which league chat established for
   * exactly this: it takes a server snapshot so the toggle hydrates without a
   * mismatch, and it is not a `setState` inside an effect, which this repo's
   * lint rule refuses.
   */
  const stored = useSyncExternalStore(
    subscribeCues,
    () => readCues(leagueId),
    () => null,
  );
  const enabled = cuesEnabled(stored);

  /**
   * What the live region is saying, adjusted **during render** rather than in an
   * effect.
   *
   * React's documented pattern for "state that follows a prop", and this repo's
   * lint rule refuses `setState` inside an effect for good reason. It also
   * happens to be the honest shape here: the announcement is *derived* from the
   * turn changing, whereas playing a sound genuinely is a side effect and stays
   * in one below.
   */
  const [said, setSaid] = useState("");
  const [saidFor, setSaidFor] = useState<number | null>(null);
  /**
   * Has a gesture unlocked audio yet?
   *
   * Browsers refuse to play a sound a user did not ask for, and a member can
   * load the room and then simply wait for their turn. Entering the room is
   * normally a tap, so this is usually already true — but when it is not, the
   * toggle **says so** rather than promising a sound that never arrives.
   */
  const [unlocked, setUnlocked] = useState(false);
  const audio = useRef<AudioContext | null>(null);
  /** What the noise last fired for, so a re-render cannot repeat it. */
  const playedFor = useRef<number | null>(null);

  const cue = clockCue({
    isYourTurn,
    overallNo,
    lastFiredFor: saidFor,
    enabled,
  });
  if (cue.announce && overallNo !== null && round !== null) {
    setSaidFor(overallNo);
    setSaid(clockSentence(overallNo, round));
  } else if (!isYourTurn && saidFor !== null) {
    // Cleared when the turn passes, so the next arrival is a *change* the
    // region will speak rather than identical text it ignores. Clearing
    // `saidFor` too is what lets the same pick number announce again after a
    // rollback walks the board back onto it.
    setSaidFor(null);
    setSaid("");
  }

  // ── unlock on the first gesture ────────────────────────────────────────────
  useEffect(() => {
    const unlock = () => {
      setUnlocked(true);
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!Ctor) return;
      audio.current ??= new Ctor();
      // Safari suspends a context created outside a gesture; resuming inside
      // one is what actually unlocks it.
      void audio.current.resume().catch(() => {});
    };
    // `once` on both: the first of either is enough, and a listener that
    // outlives its purpose is one somebody has to reason about later.
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // ── the noise, which really is a side effect ──────────────────────────────
  useEffect(() => {
    if (!enabled) {
      // Switching cues *off* still counts as having heard about this turn, so
      // switching them back on does not fire retroactively for a turn the
      // member is already looking at. Measured: enabling the toggle while on
      // the clock buzzed immediately, which reads as a malfunction rather than
      // a cue — the phone announcing something that happened a minute ago.
      playedFor.current = saidFor;
      return;
    }
    if (saidFor === null) return;
    if (playedFor.current === saidFor) return;
    playedFor.current = saidFor;
    playTone(audio.current);
    try {
      navigator.vibrate?.([...CLOCK_VIBRATION]);
    } catch {
      // iOS Safari has no Vibration API at all, so this is the Android half of
      // the room getting a buzz and the iPhone half not. The toggle's own copy
      // therefore promises *sound*, not a buzz.
    }
  }, [enabled, saidFor]);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={() => writeCues(leagueId, !enabled)}
        aria-pressed={enabled}
        data-testid="cue-toggle"
        data-enabled={enabled ? "true" : "false"}
        // A `<button>` with `aria-pressed`, which is DESIGN.md's answer for a
        // control shaped like this (open question 3: "a filter is a **button**
        // with `aria-pressed`, never a checkbox").
        className={`slot-label min-h-11 min-w-11 border px-3 transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
          enabled
            ? "border-ink text-ink"
            : "border-ink/50 text-ink-soft hover:border-ink/80 hover:text-ink"
        }`}
      >
        {enabled ? "Sound on" : "Sound off"}
      </button>
      {/* Only when it would otherwise fail silently. A promised sound that
          does not arrive is worse than one you knew was off. */}
      {enabled && !unlocked ? (
        <p className="text-sm text-ink-soft" data-testid="cue-locked">
          Tap anywhere once to let this phone make a sound.
        </p>
      ) : null}

      {/* The promise itself. Polite, off-screen, and it speaks only when your
          turn arrives — never on the ~156 re-renders a draft causes. */}
      <p
        role="status"
        aria-live="polite"
        className="sr-only"
        data-testid="clock-said"
      >
        {said}
      </p>
    </div>
  );
}

/** Two short notes, a fifth apart. Silent if audio was never unlocked. */
function playTone(context: AudioContext | null): void {
  if (!context || context.state !== "running") return;
  CLOCK_TONE.notes.forEach((hz, index) => {
    const at = context.currentTime + index * CLOCK_TONE.noteSeconds;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.frequency.value = hz;
    // A sine, not a square: a square wave at any volume sounds like an error.
    osc.type = "sine";
    // Ramped rather than switched, because a gain that starts at full value
    // clicks — and a click is the one sound this cue must not make.
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(CLOCK_TONE.gain, at + 0.01);
    gain.gain.linearRampToValueAtTime(0, at + CLOCK_TONE.noteSeconds);
    osc.connect(gain).connect(context.destination);
    osc.start(at);
    osc.stop(at + CLOCK_TONE.noteSeconds);
  });
}
