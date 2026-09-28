import type { Metadata } from "next";

import { jetbrainsMono, spaceGrotesk } from "@/app/font";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eurovafliai",
  description: "Euroleague fantasy draft platform for one small, loud league.",
};

/** The current design contract is emitted for browser-level design checks. */
const DIRECTION_CONTRACT = `<!--
  DIRECTION CONTRACT — arena interface, ADR-0009

  SCENE: a small EuroLeague draft league sets its five on a phone before tip-off,
  follows the same lineup through a match, then reads the finished league table.

  STRUCTURE: a persistent sidebar groups League, Drafts, EuroLeague and Manage
  separately. The phone uses Lineup, Players, Matchday, League and More.
  Permissions decide which destinations appear. The live draft remains prominent
  while a league is drafting.

  PALETTE: slate canvas and quiet panels. Cyan names the active choice or play,
  emerald a gain, crimson an injury or loss, and gold a captain or caution.
  State never relies on color alone. A position always prints G, F or C.

  CENTERPIECE: the fixed-ratio half court separates center, forward and guard
  rows and supports the five official G/F/C formations. Tap-to-swap, captain,
  grid and formation controls share one draft state. Recording is a distinct
  server action; an optimizer only previews.

  LIVE HONESTY: matchday calls live values provisional, says when the official
  feed was checked and names stale or unavailable data plainly. Finished-game
  standings are authoritative. Live polling remains gated until an actual
  in-game response is observed changing.

  MATERIAL: small corners on controls, circular player marks, one border on a
  framed panel. No decorative gradient or glow. Strong type and spacing carry
  hierarchy. Touch targets are at least 44px, focus is visible, and reduced
  motion is respected.

  HISTORY: ADR-0006 describes the retired midnight-orange direction. ADR-0008
  established the sidebar. ADR-0009 and DESIGN.md's current contract govern this
  interface.
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
