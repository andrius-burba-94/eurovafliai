/**
 * Which ground the board is drawn on — slice 9.5.
 *
 * Pure, and framework-free, because two very different things need the same
 * three rules: a client component that renders a control, and a string of
 * JavaScript that runs in `<head>` before anything is painted. A rule stated
 * twice is a rule that will disagree with itself, and the disagreement here
 * looks like a page that flashes white at somebody in a dark room.
 */

export const THEMES = ["day", "night"] as const;
export type Theme = (typeof THEMES)[number];

/** What `localStorage` is asked for, and what `data-theme` says. */
export const THEME_KEY = "eurovafliai-theme";

/** The attribute values are CSS's words, not ours — `globals.css` matches them. */
export const ATTRIBUTE: Readonly<Record<Theme, string>> = {
  day: "light",
  night: "dark",
};

export function isTheme(value: unknown): value is Theme {
  return value === "day" || value === "night";
}

/**
 * The ground in force: an explicit choice if there is one, the system otherwise.
 *
 * Note the asymmetry with `overrideFor` below — this resolves, that decides
 * what to persist. Both have to agree or the control lies about its own state.
 */
export function resolveTheme(input: {
  readonly stored: string | null;
  readonly systemPrefersNight: boolean;
}): Theme {
  if (isTheme(input.stored)) return input.stored;
  return input.systemPrefersNight ? "night" : "day";
}

/**
 * What to store when somebody picks a ground — and `null` means *stop storing*.
 *
 * Choosing the ground the system already asks for **clears** the override
 * rather than pinning it. Without that there is no way back to "follow my
 * phone" short of clearing site data: every press would write one more
 * override, and a reader who turns their phone to night mode at kickoff would
 * still be on the day board because of a tap they made in July.
 */
export function overrideFor(input: {
  readonly chosen: Theme;
  readonly systemPrefersNight: boolean;
}): Theme | null {
  const system: Theme = input.systemPrefersNight ? "night" : "day";
  return input.chosen === system ? null : input.chosen;
}

/** The other one. A toggle has exactly two positions here. */
export const otherTheme = (theme: Theme): Theme =>
  theme === "night" ? "day" : "night";

/**
 * The script that runs before first paint.
 *
 * It applies an **explicit override only** — the system preference is read in
 * CSS by `@media (prefers-color-scheme: dark)`, which is what keeps somebody
 * with JavaScript disabled on the ground their phone asked for, and what lets
 * the OS switching at 21:00 reach a page that is already open.
 *
 * Wrapped in try/catch because `localStorage` throws rather than returning null
 * in a locked-down Safari, and a theme preference must never be the thing that
 * stops the draft room rendering.
 */
export const THEME_SCRIPT = `try{var t=localStorage.getItem(${JSON.stringify(
  THEME_KEY,
)});if(t==="day"||t==="night"){document.documentElement.setAttribute("data-theme",t==="night"?"dark":"light")}}catch(e){}`;
