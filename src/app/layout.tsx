import type { Metadata, Viewport } from "next";

import { barlowCondensed, jetbrainsMono, spaceGrotesk } from "@/app/font";
import { GROUND_COLOR, THEME_SCRIPT } from "@/lib/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: "Eurovafliai",
  description:
    "Create a private EuroLeague fantasy draft league, invite friends, and follow the season.",
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: GROUND_COLOR.dark },
    { media: "(prefers-color-scheme: light)", color: GROUND_COLOR.light },
  ],
};

/** The current design contract is emitted for browser-level design checks. */
const DIRECTION_CONTRACT = `<!--
  DIRECTION CONTRACT — matchnight broadcast, ADR-0011

  SCENE: friends on a couch at 20:00 CET with the game on the TV, and quick
  phone checks the morning after. The app reads like the scoreboard graphic in
  the same room: one big number per page, calm until something happens.

  STRUCTURE: a persistent sidebar groups League, Drafts and EuroLeague; a
  manager's roster tools sit in EuroLeague, and the pool sits in League.
  Phone tabs in season are Home, Lineup, Live, Table and More. Permissions
  decide which destinations appear.

  PALETTE: dark and light grounds follow the device unless the reader holds
  one with the sidebar's theme switch. Tip-off orange is the one
  act, the selection and whoever is on the clock; gain is green, loss red, gold
  crowns and captains. Each member's team has a colour and a monogram crest.
  State never relies on colour alone. A position always prints G, F or C.

  TYPE: Barlow Condensed is the broadcast voice for headlines, scores and team
  names; Space Grotesk sets every other word; JetBrains Mono sets figures in a
  column.

  MOMENTS: round winner crown, rank overtake, trade verdict, wooden spoon,
  streak badges and the draft's pick-is-in lower third. Each plays once per
  viewer and holds still under reduced motion.

  LIVE HONESTY: live values are provisional and say when the feed was checked.
  Finished-game standings are authoritative.
-->`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The head script writes `data-theme` before first paint, so the server's
    // `<html>` cannot know it; the warning is suppressed for that element only.
    <html
      lang="en"
      className={`${spaceGrotesk.variable} ${jetbrainsMono.variable} ${barlowCondensed.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-full flex flex-col bg-stock text-ink">
        <div hidden dangerouslySetInnerHTML={{ __html: DIRECTION_CONTRACT }} />
        {/* First focusable control in the document. Off-screen until focused,
            so Tab from the top of any page can jump the shell's sidebar and
            header. The shell's (or Sheet's) <main id="main"> is the landing. */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-live focus:px-4 focus:py-3 focus:text-sm focus:font-bold focus:text-live-ink focus:outline-none"
        >
          Skip to content
        </a>
        {children}
      </body>
    </html>
  );
}
