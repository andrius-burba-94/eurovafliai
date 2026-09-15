"use client";

import { useSyncExternalStore } from "react";

import { MoonIcon, SunIcon } from "@/components/board";
import {
  ATTRIBUTE,
  otherTheme,
  overrideFor,
  resolveTheme,
  THEME_KEY,
  type Theme,
} from "@/lib/theme";

/**
 * Which ground the board is drawn on — slice 9.5, and it rides in the top rail
 * so it is on every surface without any page knowing about it.
 *
 * It is a plain button with `aria-pressed` — DESIGN.md's answer to open
 * question 3, and the same contract `FilterToggle` carries. What it does *not*
 * borrow from `FilterToggle` is the rule under the label, because this control
 * no longer has a label: the icon is the state. A sun means the day board, a
 * moon means the night board, and a dashed rule under either would be the same
 * fact stated twice.
 *
 * The accessible name stays the word "Night board" rather than swapping with
 * the picture, so a screen reader hears one control changing position instead
 * of two controls trading places. `aria-pressed` is what says which way it is.
 *
 * Three behaviours worth knowing, all decided in `src/lib/theme.ts`:
 *
 * - **The system decides until somebody says otherwise.** No stored value means
 *   `@media (prefers-color-scheme: dark)` is in force, which is why a reader
 *   with JavaScript off still gets the ground their phone asked for.
 * - **Choosing what the system already wants clears the override.** Otherwise
 *   there is no way back to "follow my phone" without clearing site data.
 * - **The OS switching at kickoff reaches an open page**, because the media
 *   query is live and this control is subscribed to it.
 *
 * Both inputs are read through `useSyncExternalStore` rather than an effect
 * that calls `setState`. They *are* external stores — one is the OS, the other
 * is `localStorage` — and reading them this way is what gives the server a
 * defined snapshot to render instead of a guess it has to correct.
 */

const listeners = new Set<() => void>();

/** The stored override, and the two ways it can change under us. */
const storedTheme = {
  subscribe(onChange: () => void) {
    listeners.add(onChange);
    // Another tab is the other way: switching the ground there should not
    // leave this tab disagreeing with what is stored.
    window.addEventListener("storage", onChange);
    return () => {
      listeners.delete(onChange);
      window.removeEventListener("storage", onChange);
    };
  },
  get(): string | null {
    try {
      return window.localStorage.getItem(THEME_KEY);
    } catch {
      // A locked-down browser refuses storage rather than returning null. The
      // system preference still works; only remembering a choice does not.
      return null;
    }
  },
  /** The server has no storage, so it renders the system's answer. */
  server: (): string | null => null,
};

const MEDIA = "(prefers-color-scheme: dark)";

const systemTheme = {
  subscribe(onChange: () => void) {
    const media = window.matchMedia(MEDIA);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  },
  get: (): boolean => window.matchMedia(MEDIA).matches,
  /** And no system preference either — the day board is the app's default. */
  server: (): boolean => false,
};

export function ThemeControl() {
  const stored = useSyncExternalStore(
    storedTheme.subscribe,
    storedTheme.get,
    storedTheme.server,
  );
  const systemPrefersNight = useSyncExternalStore(
    systemTheme.subscribe,
    systemTheme.get,
    systemTheme.server,
  );

  const theme: Theme = resolveTheme({ stored, systemPrefersNight });

  function choose(next: Theme) {
    const override = overrideFor({ chosen: next, systemPrefersNight });
    try {
      if (override) window.localStorage.setItem(THEME_KEY, override);
      else window.localStorage.removeItem(THEME_KEY);
    } catch {
      // Unstorable is not unusable: the attribute below still switches the
      // ground for this visit.
    }

    // The attribute is what the stylesheet reads; `localStorage` is only how
    // the next page load learns the same thing before it paints.
    const root = document.documentElement;
    if (override) root.setAttribute("data-theme", ATTRIBUTE[override]);
    else root.removeAttribute("data-theme");

    for (const listener of listeners) listener();
  }

  const night = theme === "night";

  return (
    <button
      type="button"
      data-testid="theme-control"
      aria-pressed={night}
      aria-label="Night board"
      onClick={() => choose(otherTheme(theme))}
      // 44px on both axes, which is this project's written target and the one
      // `FilterToggle` had to learn twice — a 16px icon is exactly the kind of
      // control that falls through a height-only rule.
      //
      // `self-end`, not the rail's baseline: a button whose only child is an
      // SVG has no baseline of its own, and it belongs in the line of controls
      // at the bottom of the rail rather than on the wordmark's line. See the
      // note on `TopRail`'s action group.
      className="inline-flex min-h-11 min-w-11 items-center justify-center self-end text-ink-soft transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
    >
      {night ? <MoonIcon /> : <SunIcon />}
    </button>
  );
}
