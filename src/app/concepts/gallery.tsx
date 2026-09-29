"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { ReactNode } from "react";

import { ComponentSheet, CrestSheet, PaletteSheet, TypeSheet } from "./foundation";
import { DesktopFrame, PhoneFrame, type Tab } from "./kit";
import { MomentsSheet } from "./moments";
import { DraftRing, DraftScorebug, RollCards, RollStage } from "./screens-draft";
import { RecapAwards, RecapFrontPage, StatsProfiles, StatsRecordBook, TradesCards, TradesLedger } from "./screens-review";
import {
  HomeFrontPage,
  HomeScorebug,
  LineupHardwood,
  LineupNight,
  MatchdayCourt,
  MatchdayScoreboard,
  StandingsPodium,
  StandingsRace,
} from "./screens-season";

type Variant = { name: string; pitch: string; render: () => ReactNode };
type Screen = { key: string; title: string; intro: string; tab: Tab; here: string; bare?: boolean; variants: [Variant, Variant] };

const SCREENS: Screen[] = [
  {
    key: "home",
    title: "League Home",
    intro: "Your team leads the page: crest, rank and total at scoreboard size, and the one thing to do next. The round's story and the table sit underneath.",
    tab: "home",
    here: "home",
    variants: [
      { name: "A · Scorebug", pitch: "Your team as the hero strip, then a ticker of the round, then table and story.", render: () => <HomeScorebug /> },
      { name: "B · Front page", pitch: "The round's headline leads; your team is a scorebug under it.", render: () => <HomeFrontPage /> },
    ],
  },
  {
    key: "matchday",
    title: "Live (Matchday)",
    intro: "One huge provisional total, your live rank, and how many of your players are still to play.",
    tab: "live",
    here: "live",
    variants: [
      { name: "A · Scoreboard", pitch: "Total and rank first, your five as a live list, games as score tiles.", render: () => <MatchdayScoreboard /> },
      { name: "B · Court live", pitch: "Your five on the court with live points under each disc.", render: () => <MatchdayCourt /> },
    ],
  },
  {
    key: "lineup",
    title: "Lineup",
    intro: "The court is the first thing you see. The round and its lock are one line above it; the bench is a tray below.",
    tab: "lineup",
    here: "lineup",
    variants: [
      { name: "A · Night court", pitch: "A dark court, lines only, so the players carry the colour.", render: () => <LineupNight /> },
      { name: "B · Hardwood", pitch: "A warm parquet court, the one place the app feels like a gym.", render: () => <LineupHardwood /> },
    ],
  },
  {
    key: "standings",
    title: "Standings",
    intro: "Who is winning and by how much. Each round's winner is marked gold; every row shows its gap to the top.",
    tab: "table",
    here: "table",
    variants: [
      { name: "A · Podium", pitch: "A podium for the top three, then the full table with round columns.", render: () => <StandingsPodium /> },
      { name: "B · The race", pitch: "A rank-by-round race chart in team colours, then a compact table.", render: () => <StandingsRace /> },
    ],
  },
  {
    key: "recap",
    title: "Recap",
    intro: "The morning after: a headline written from the facts, the crowned winner, the best night, the captain call and the spoon.",
    tab: "home",
    here: "recap",
    variants: [
      { name: "A · Front page", pitch: "A headline and the winner's banner, then the night as a ladder.", render: () => <RecapFrontPage /> },
      { name: "B · Awards night", pitch: "Four award cards, then everyone's night.", render: () => <RecapAwards /> },
    ],
  },
  {
    key: "trades",
    title: "Trades",
    intro: "Every deal with faces and a running verdict.",
    tab: "more",
    here: "trades",
    variants: [
      { name: "A · Deal cards", pitch: "One card per deal, out and in side by side, stamped winning or losing.", render: () => <TradesCards /> },
      { name: "B · Ledger", pitch: "Net points won or lost per team, then a compact history.", render: () => <TradesLedger /> },
    ],
  },
  {
    key: "stats",
    title: "League Stats (new)",
    intro: "Records, team profiles, lineup efficiency, draft value, player leaders and the deal ledger, with badges earned so far.",
    tab: "more",
    here: "stats",
    variants: [
      { name: "A · Record book", pitch: "Tabs by topic; records first, badges beside them.", render: () => <StatsRecordBook /> },
      { name: "B · Team profiles", pitch: "A comparison table first, then bench points and draft steals.", render: () => <StatsProfiles /> },
    ],
  },
  {
    key: "draft",
    title: "Draft room",
    intro: "Whose turn it is, at a size the couch can read, and the pick-is-in lower third when a pick lands.",
    tab: "home",
    here: "draft",
    variants: [
      { name: "A · Scorebug band", pitch: "The picker's team colour fills the band; the board has team-coloured column heads.", render: () => <DraftScorebug /> },
      { name: "B · Clock ring", pitch: "A countdown ring beside the picker, best available underneath.", render: () => <DraftRing /> },
    ],
  },
  {
    key: "roll",
    title: "The roll",
    intro: "Full-screen stage with no app chrome. The draft order is drawn in front of the league.",
    tab: "home",
    here: "draft",
    bare: true,
    variants: [
      { name: "A · Stage", pitch: "One big reveal at a time; the order fills from the last pick up.", render: () => <RollStage /> },
      { name: "B · Cards", pitch: "Face-down cards flip one by one.", render: () => <RollCards /> },
    ],
  },
];

const SHEETS = [
  { key: "type", title: "Type", intro: "Four condensed display candidates for headlines, scores and team names. Every one covers Lithuanian diacritics. The UI and tables keep a regular sans and a mono.", render: () => <TypeSheet /> },
  { key: "palette", title: "Palette", intro: "Tokens for the selected palette and theme. The accent is the one act on a surface; live is a red bug with a word; gold is crowns and captains.", render: () => <PaletteSheet /> },
  { key: "crests", title: "Team crests", intro: "Twelve colours and four shapes. The monogram always prints, so colour never carries identity alone.", render: () => <CrestSheet /> },
  { key: "components", title: "Components", intro: "One button family, badges with words, the round stepper, position letters, deltas and player discs.", render: () => <ComponentSheet /> },
  { key: "moments", title: "Moments", intro: "The five celebrations plus the draft banner. Each plays once per viewer and holds still under reduced motion.", render: () => <MomentsSheet /> },
] as const;

const OPTIONS = {
  font: [
    ["barlow", "Barlow"],
    ["saira", "Saira"],
    ["shoulders", "Big Shoulders"],
    ["archivo", "Archivo"],
  ],
  palette: [
    ["tipoff", "Tip-off (orange)"],
    ["floodlight", "Floodlight (cyan)"],
  ],
  theme: [
    ["dark", "Dark"],
    ["light", "Light"],
  ],
  frame: [
    ["phone", "Phone"],
    ["desktop", "Desktop"],
  ],
} as const;

type OptionKey = keyof typeof OPTIONS;

export function Gallery() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const value = (key: OptionKey) => params.get(key) ?? OPTIONS[key][0][0];
  const only = params.get("only");

  const set = (key: OptionKey, next: string) => {
    const search = new URLSearchParams(params.toString());
    search.set(key, next);
    router.replace(`${pathname}?${search.toString()}`, { scroll: false });
  };

  const frame = value("frame");
  const screens = SCREENS.filter((screen) => !only || screen.key === only);
  const sheets = SHEETS.filter((sheet) => !only || sheet.key === only);

  return (
    <div className="cx cx-gallery" data-font={value("font")} data-palette={value("palette")} data-theme={value("theme")}>
      <div className="cx-toolbar">
        <span className="cx-wordmark">
          Match<span>night</span> concepts
        </span>
        {(Object.keys(OPTIONS) as OptionKey[]).map((key) => (
          <span key={key} className="cx-toolbar-group" role="group" aria-label={key}>
            <span className="cx-toolbar-label">{key}</span>
            {OPTIONS[key].map(([id, label]) => (
              <button key={id} type="button" className="cx-seg" aria-pressed={value(key) === id} onClick={() => set(key, id)}>
                {label}
              </button>
            ))}
          </span>
        ))}
      </div>
      <nav className="cx-index" aria-label="Sections">
        {[...SHEETS, ...SCREENS].map((item) => (
          <a key={item.key} href={`#${item.key}`} className="cx-seg" style={{ display: "inline-grid", placeItems: "center", textDecoration: "none", whiteSpace: "nowrap" }}>
            {item.title}
          </a>
        ))}
      </nav>
      <main className="cx-sheet">
        {sheets.map((sheet) => (
          <section key={sheet.key} id={sheet.key} style={{ display: "grid", gap: "1.25rem", scrollMarginTop: "8rem" }}>
            <div className="cx-sheet-head">
              <h2>{sheet.title}</h2>
              <p>{sheet.intro}</p>
            </div>
            {sheet.render()}
          </section>
        ))}
        {screens.map((screen) => (
          <section key={screen.key} id={screen.key} style={{ display: "grid", gap: "1.25rem", scrollMarginTop: "8rem" }}>
            <div className="cx-sheet-head">
              <h2>{screen.title}</h2>
              <p>{screen.intro}</p>
            </div>
            <div className="cx-variants">
              {screen.variants.map((variant) => (
                <div key={variant.name} className="cx-variant">
                  <div className="cx-variant-label">
                    <b>{variant.name}</b>
                    <span>{variant.pitch}</span>
                  </div>
                  {frame === "desktop" ? (
                    <DesktopFrame here={screen.here}>{variant.render()}</DesktopFrame>
                  ) : (
                    <PhoneFrame tab={screen.tab} bare={screen.bare}>{variant.render()}</PhoneFrame>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}
