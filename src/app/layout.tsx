import type { Metadata } from "next";

import { jetbrainsMono, spaceGrotesk } from "@/app/font";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eurovafliai",
  description: "Euroleague fantasy draft platform for one small, loud league.",
};

/**
 * The direction contract for the visual world — Phase 1.4, re-grounded in
 * Phase 10 (ADR-0006, blueprint D22).
 *
 * It ships as a real HTML comment in the emitted markup, not as a JSX comment:
 * `{/* … *\/}` is a JavaScript comment and never reaches the browser — it turns
 * up only in a sourcemap, which is a contract nobody can audit. React has no
 * comment node, so the only way to emit one is this wrapper. Verify with:
 *   curl -s http://localhost:3007/login | grep 'DIRECTION CONTRACT'
 */
const DIRECTION_CONTRACT = `<!--
  DIRECTION CONTRACT — Phase 10 (seed 32792572)

  THESIS: the app is the draft board, a grid of ruled slots that picks get
  slotted into, lit for a night game. The board itself is the ground and the
  marks on it are chalk.

  WHAT THIS REVERSES, AND WHAT IT DOES NOT: Phase 1.4 refused "the near-black
  surface with one glowing accent" and argued a light ground from the room.
  Phase 10 takes the ground dark (#0B1120) with one Euroleague orange
  (#FF5500), because Euroleague tips at 20:00 CET and the room is dim. What the
  original refusal protected is KEPT: a dark ground must not do the work that
  structure should do, and one accent must not glow decoratively. No gradient,
  no glow, no coloured halo, no blurred backdrop, no metric-tile hero.

  OWN-WORLD: the midnight board as the ground; panel stock LIGHTER than it
  (depth on a dark ground is lightness) at one level, with one radius step and
  no level below it; the board's ruling as the ink in four weights (1px dashed
  waiting, 1px solid filled, 2px marker live, 2px ink correction); vibrant
  cyan/emerald/amber G/F/C coding that ALWAYS prints its letter, because the
  letter is the carrier and the colour is the convenience; Space Grotesk for
  words and JetBrains Mono for figures in a column, tabular throughout. Orange
  has two jobs and no others: state (the slot on the clock) and the one act (a
  surface's single primary action, with the focus and caret affordances of
  acting). The double-weight marker rule means one thing only — this slot is on
  the clock.

  STORY: this is a real competition instrument, readable at a glance in a loud
  room; you create or join a league and take your slot.

  FIRST VIEWPORT: wordmark and season in 11px caps, on every device; beside
  or below it, slots at full width, dashed while waiting and solid once
  filled; the primary action sits inside a slot, never in a floating card, and
  carries the marker.

  LAYOUT (Phase 11, ADR-0008): one app shell — a sidebar from lg, a header on
  every width, a Players / Schedule / News panel that is a column from xl and
  a sheet below it, a bottom tab bar below lg. Layout, not skin: no new token,
  no floating layer, no shadow or scrim under the sheet. The current nav item
  is ruled in ink; orange never marks navigation.

  FORM: the draft board, first on the ordered list of grounded candidates.

  SIGNATURE INTERACTION: a card landing in its slot — 260ms on an ease-out
  quart curve, on the row that just arrived, keyed off the ?arrived=1 the
  create and join actions set; under prefers-reduced-motion the state changes
  without the travel. This app gets a budget of THREE animations: that, the
  live rule advancing across the board, and a draft selection springing into
  place. The budget is spent; a fourth is a change to DESIGN.md.

  VOCABULARY: CONTEXT.md owns the words. A slot is a position on the board.
  An earlier draft of this design invented "bay" and led a headline with it.

  FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // No `suppressHydrationWarning` and no `<head>` script since Phase 10.
    // Both existed for the ground switch: the script wrote `data-theme` before
    // first paint so a dark reader never saw a white flash. There is one ground
    // now, declared in CSS, so the server's markup and the browser's agree.
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-stock text-ink">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {/* First focusable control in the document. Off-screen until focused,
            so Tab from the top of any page can jump the shell's sidebar and
            header. The shell's (or Sheet's) <main id="main"> is the landing. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:border-2 focus:border-live focus:bg-stock focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:uppercase focus:tracking-[0.14em] focus:text-live focus:outline-none"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
