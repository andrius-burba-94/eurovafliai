"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * The row you have picked up, shared between the pool and the sticky band.
 *
 * ## Why a context rather than local state
 *
 * Because the confirming tap deliberately lands somewhere else. A tap on a pool
 * row **arms** it; the tap that actually drafts is `Draft <Name>` in the
 * on-the-clock band at the top of the viewport. That is not a layout
 * preference — it is the whole reason the confirmation works. With the confirm
 * on the row's own button, **a fast double-tap arms and picks inside 200ms**,
 * so the guard would catch a stray single tap and miss the fat-finger
 * double-tap blueprint 3.7 is actually about. Putting the confirm out of reach
 * of that gesture is the fix, and it gives the pointer a `Cancel` it never had
 * (Escape was keyboard-only).
 *
 * The band is rendered by a server component and the pool by a client one, so
 * one small provider wraps the region containing both. It holds an id and
 * nothing else: whose turn it is, which players are legal and whether a pick
 * may land are all still the engine's, on the server (invariant §1). Arming is
 * a statement of intent, not a decision about the draft.
 *
 * Same shape 3.4b landed on for the cheat sheet — one action on the row, every
 * verb in a fixed bar — reached independently and for the same reason.
 */

export type ArmedPick = {
  readonly playerId: string;
  readonly playerName: string;
  /**
   * Whose roster it would join. A manager may be arming a pick *for* somebody
   * with a dead phone ("Pick for them"), and the band has to name whose turn is
   * being spent rather than implying it is theirs.
   */
  readonly forTeamName: string | null;
};

type ArmedContext = {
  readonly armed: ArmedPick | null;
  readonly arm: (pick: ArmedPick) => void;
  readonly disarm: () => void;
  /**
   * The player a refusal is about, so the *row* can say so too.
   *
   * 3.3's critique fixed exactly this: a refusal used to render above the
   * search box, which on a phone is up to thirty rows from the row that was
   * tapped, and the fix was to strike that row in `slot-correction`. Moving
   * the confirming tap into the band would have quietly traded that fix away —
   * the band explains itself, but the row would have gone back to saying
   * nothing. Both now.
   */
  readonly refused: { playerId: string; reason: string } | null;
  readonly refuse: (refusal: { playerId: string; reason: string } | null) => void;
};

const Context = createContext<ArmedContext | null>(null);

export function ArmedPickProvider({ children }: { children: ReactNode }) {
  const [armed, setArmed] = useState<ArmedPick | null>(null);
  const [refused, setRefused] = useState<{
    playerId: string;
    reason: string;
  } | null>(null);

  const arm = useCallback((pick: ArmedPick) => {
    // Arming a different row clears a refusal about the last one, so a stale
    // correction cannot sit on a row nobody is looking at any more.
    setRefused(null);
    setArmed(pick);
  }, []);
  const disarm = useCallback(() => {
    setRefused(null);
    setArmed(null);
    /**
     * Put focus back where choosing happens.
     *
     * Without this, disarming drops focus on the floor: the confirming button
     * takes focus when it appears (that is what keeps the keyboard at two
     * keystrokes), and cancelling unmounts the element focus is on, so the
     * browser falls back to `<body>` — with a clock running. It is the same
     * defect 3.5 and 3.4b each shipped once and each had found by a critique,
     * so it is closed here before anybody has to measure it.
     *
     * Queried off the document rather than threaded through a ref: the pool's
     * own Escape handler has always done exactly this, `pool-search` is unique
     * on the page, and the alternative is a ref passed through a context whose
     * whole point is that it carries one id and no coupling.
     */
    document
      .querySelector<HTMLInputElement>('[data-testid="pool-search"]')
      ?.focus();
  }, []);
  const refuse = useCallback(
    (refusal: { playerId: string; reason: string } | null) => {
      setRefused(refusal);
    },
    [],
  );

  const value = useMemo(
    () => ({ armed, arm, disarm, refused, refuse }),
    [armed, arm, disarm, refused, refuse],
  );

  return (
    <Context.Provider value={value}>
      {/* Escape disarms from anywhere in the room, not just from the pool.
          Before 3.7 the pool's Escape lived on its search input, so it died
          the moment focus moved to the row's button — with a pick armed and a
          clock running, which is exactly when the promise mattered. 3.3's
          critique found that; this is the same bug made unavailable. */}
      <div
        onKeyDown={(event) => {
          if (event.key === "Escape" && armed) {
            event.preventDefault();
            // `disarm`, not `setArmed(null)`: it also puts focus back where
            // choosing happens, and Escape is the one path that arrives with
            // focus on a button about to unmount.
            disarm();
          }
        }}
        className="flex flex-col gap-5 sm:gap-6"
      >
        {children}
      </div>
    </Context.Provider>
  );
}

/**
 * Read the armed pick.
 *
 * Returns a null-armed no-op outside a provider rather than throwing, so a
 * surface that renders a pick button without the band — none today, but the
 * lobby is one refactor away — degrades to the old behaviour instead of
 * crashing the room.
 */
export function useArmedPick(): ArmedContext {
  const context = useContext(Context);
  return context ?? FALLBACK;
}

const FALLBACK: ArmedContext = {
  armed: null,
  arm: () => {},
  disarm: () => {},
  refused: null,
  refuse: () => {},
};
