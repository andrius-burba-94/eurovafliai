import { JetBrains_Mono, Space_Grotesk } from "next/font/google";

/*
 * Two families with one job each — Phase 10 / D22, replacing the One Label
 * Maker Rule that ran from 1.4 to 9.5.
 *
 * `latin-ext` is not optional and now has to hold for BOTH: this league reads
 * names like Valančiūnas and Motiejūnas, and a font that falls back mid-word
 * for the diacritics makes the board look broken. Both were checked against
 * Next's own font metadata before being chosen rather than assumed —
 * `node_modules/next/dist/compiled/@next/font/dist/google/font-data.json`.
 *
 * Shared so `global-error` can load the same faces after it replaces the root
 * layout (Next's own docs: the file must define html, body, styles and fonts).
 */

/** Every word: display, names, labels, body. Reached through `--font-sans`. */
export const spaceGrotesk = Space_Grotesk({
  variable: "--font-space-grotesk",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

/**
 * Every figure that lives in a column. Reached through `--font-mono` and the
 * `stat` utility — never prose, and never a name.
 *
 * It is here because the app got dense: a 323-row pool with a PIR column, a
 * standings run per round, a box score. `tabular-nums` was already on
 * everything and it makes a column *line up*; it does not make two adjacent
 * figures easy to tell apart at 14px on a phone, which is what a mono face with
 * a distinguishable 1/7 and 0/O does.
 */
export const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});
