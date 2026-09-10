import type { Metadata } from "next";

import { archivo } from "@/app/font";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eurovafliai",
  description: "Euroleague fantasy draft platform for one small, loud league.",
};

/**
 * The direction contract for the visual world, Phase 1.4.
 *
 * It ships as a real HTML comment in the emitted markup, not as a JSX comment:
 * `{/* … *\/}` is a JavaScript comment and never reaches the browser — it turns
 * up only in a sourcemap, which is a contract nobody can audit. React has no
 * comment node, so the only way to emit one is this wrapper. Verify with:
 *   curl -s http://localhost:3007/login | grep 'DIRECTION CONTRACT'
 */
const DIRECTION_CONTRACT = `<!--
  DIRECTION CONTRACT — Phase 1.4 (seed 32792572)

  THESIS: the app is the draft board, a grid of ruled slots that picks get
  slotted into. It refuses the near-black surface with one glowing accent, and
  the metric-tile hero, that this category ships.

  OWN-WORLD: cool card stock as the ground, deeper stock inside one level of
  framed Banks, the board's ruling as the ink in four weights (1px dashed
  waiting, 1px solid filled, 2px marker live, 2px ink correction), muted G/F/C
  twill patches, Archivo in caps with tabular figures throughout. Framed Banks
  never nest; nothing rounds or floats. Marker red has two jobs and no others:
  state (the slot on the clock) and the one act (a surface's single primary
  action, with the focus and caret affordances of acting). The double-weight
  marker rule means one thing only — this slot is on the clock.

  STORY: this is a real competition instrument, readable at a glance in a loud
  room; you create or join a league and take your slot.

  FIRST VIEWPORT: top rail with wordmark and season in 11px caps, on every
  device; below it, slots at full width, dashed while waiting and solid once
  filled; the primary action sits inside a slot, never in a floating card, and
  carries the marker.

  FORM: the draft board, first on the ordered list of grounded candidates.

  SIGNATURE INTERACTION: a card landing in its slot — 260ms on an ease-out
  quart curve, on the row that just arrived, keyed off the ?arrived=1 the
  create and join actions set; under prefers-reduced-motion the state changes
  without the travel. This app gets a budget of two animations ever. The second,
  the live rule advancing, has no code yet because there is no draft with a
  clock — Phase 3 owns defining it, and that spends the budget.

  VOCABULARY: CONTEXT.md owns the words. A slot is a position on the board.
  An earlier draft of this design invented "bay" and led a headline with it.

  FINISH: unreviewed and undocumented is unfinished; this build ends with the
  finish review, the verdict, and DESIGN.md
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${archivo.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-stock text-ink">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {/* First focusable control in the document. Off-screen until focused,
            so Tab from the top of any page can jump the TopRail. Sheet's
            <main id="main"> is the landing. */}
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
