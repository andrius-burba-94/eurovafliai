"use client";

import { useSyncExternalStore } from "react";

/** For `useSyncExternalStore` as a hydration flag: the store never changes. */
const subscribeToNothing = () => () => {};

/**
 * Has this component hydrated?
 *
 * Every draft-night surface streams its markup first, so controls are in the
 * HTML — clickable, focusable, selectable — before React has attached a single
 * handler to them. An action taken in that window reaches nothing, and the
 * specs that lost the race lost it silently: a toggled filter narrowed no rows,
 * a pressed key moved no sheet row.
 *
 * `false` on the server and on the hydrating pass, `true` after, which is
 * exactly `useSyncExternalStore`'s server/client split and the one way to read
 * this without an effect that re-renders for its own sake. Surface it as an
 * attribute with no appearance (`data-ready`) so a spec waits for the fact
 * rather than for a duration.
 */
export function useHydrated() {
  return useSyncExternalStore(
    subscribeToNothing,
    () => true,
    () => false,
  );
}
