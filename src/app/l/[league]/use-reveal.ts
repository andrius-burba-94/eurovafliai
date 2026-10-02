"use client";

import { useEffect, useRef, useState } from "react";

/**
 * The roll, revealed one slot at a time.
 *
 * Everyone in the lobby receives the same position updates over the realtime
 * subscription and runs this same staged reveal against them, so the room
 * watches the order arrive together instead of having it simply appear.
 *
 * **Last slot first.** A draft lottery builds towards who picks first, so the
 * final slot lands first and 01 lands last. Revealing top-down would give the
 * answer away in the first half second.
 *
 * **It animates when the order *arrives*, never on a page load.** The trigger is
 * the seed changing to a new value — which happens on the first roll and on a
 * genuine reshuffle, and not on a refresh, a re-apply, or anyone else joining.
 * The first pass simply adopts whatever seed is already there. That is also why
 * this needs no sessionStorage: there is no replay to suppress.
 *
 * Every state change happens inside a timer rather than in the effect body.
 * Setting state synchronously in an effect cascades renders, and this repo's
 * lint says so.
 *
 * Reduced motion gets no version of this rather than a faster one: the whole
 * order appears at once, because the staging *is* the effect.
 */
const STEP_MS = 550;

export function useRollReveal({
  seed,
  slots,
}: {
  /** The stored roll seed. Changes only when the order is genuinely re-drawn. */
  seed: string;
  /** How many members have a position. */
  slots: number;
}): { revealed: (position: number) => boolean; running: boolean } {
  /** Slots still hidden, counting down from the last one. 0 means all visible. */
  const [pending, setPending] = useState(0);
  const lastSeed = useRef<string | null>(null);

  useEffect(() => {
    // First pass: adopt whatever is already on screen without animating it.
    if (lastSeed.current === null) {
      lastSeed.current = seed;
      return;
    }
    if (!seed || slots === 0 || seed === lastSeed.current) return;
    lastSeed.current = seed;

    if (
      typeof matchMedia !== "undefined" &&
      matchMedia("(prefers-reduced-motion: reduce)").matches
    ) {
      return;
    }

    const timers = [setTimeout(() => setPending(slots), 0)];
    for (let step = 1; step <= slots; step += 1) {
      timers.push(
        setTimeout(
          () => setPending((remaining) => Math.max(remaining - 1, 0)),
          step * STEP_MS,
        ),
      );
    }

    return () => {
      for (const timer of timers) clearTimeout(timer);
      setPending(0);
    };
  }, [seed, slots]);

  return {
    revealed: (position: number) => position > pending,
    running: pending > 0,
  };
}
