"use client";

import { useSyncExternalStore } from "react";

import { FilterToggle } from "@/components/board";
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
 * It is a `FilterToggle`, deliberately, rather than a new control: DESIGN.md's
 * answer to open question 3 is that a two-state control here is a **button with
 * `aria-pressed`**, carrying its state in its own rule. A theme switch is the
 * same shape as "Hide drafted", so it is the same component — a sun/moon icon
 * button would have been a second idiom and a third material at once.
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

  return (
    <FilterToggle
      testId="theme-control"
      pressed={theme === "night"}
      onPressedChange={() => choose(otherTheme(theme))}
    >
      Night
    </FilterToggle>
  );
}
