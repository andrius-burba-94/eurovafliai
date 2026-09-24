import type { NavIconName } from "@/lib/nav/items";

/**
 * The shell's marks, drawn in the recipe DESIGN.md's Shapes section records:
 * one stroke, no fill, `currentColor`, drawn on 16 units and rendered at 18px
 * so the stroke lands a shade over 1px. Always beside their word, so they are
 * `aria-hidden` and never the label.
 */
const PATHS: Record<NavIconName, string> = {
  home: "M2.5 7.5 8 3l5.5 4.5M4 6.5v6.5h3v-3.5h2V13h3V6.5",
  leagues: "M2.5 3.5h4.5v4H2.5zM9 3.5h4.5v4H9zM2.5 9.5h4.5v3H2.5zM9 9.5h4.5v3H9z",
  pool: "M8 2.5a3 3 0 1 1 0 6 3 3 0 0 1 0-6ZM3 13.5c.6-2.4 2.6-3.5 5-3.5s4.4 1.1 5 3.5",
  news: "M3 3h8v10H4a1 1 0 0 1-1-1V3ZM11 6h2v6a1 1 0 0 1-2 0M5 5.5h4M5 8h4M5 10.5h2.5",
  mapping: "M4 4.5a1.5 1.5 0 1 1 0-.01M12 11.5a1.5 1.5 0 1 1 0-.01M5.5 4.5h3a2 2 0 0 1 2 2v3",
  import: "M8 2.5v7M5 7l3 3 3-3M3 11v2.5h10V11",
  draft: "M2.5 3.5h11v9h-11zM2.5 6.5h11M6.2 3.5v9M9.8 3.5v9",
  order: "M5.5 4h8M5.5 8h8M5.5 12h8M2.5 3.5v1M2.2 7.5h1l-1 1.2h1M2.2 11.3h1v1.4h-1",
  team: "M5.5 2.5 3 4v3h1.5v6.5h7V7H13V4l-2.5-1.5C10 3.6 9.1 4.2 8 4.2S6 3.6 5.5 2.5Z",
  lineup: "M2.5 2.5h11v11h-11zM2.5 8h11M8 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z",
  standings: "M3 13.5V9h2.5v4.5M6.8 13.5V5h2.5v8.5M10.5 13.5V7.5H13v6M2 13.5h12",
  recap: "M8 2.5a5.5 5.5 0 1 1 0 11 5.5 5.5 0 0 1 0-11ZM8 5v3l2 1.5",
  trades: "M3 5.5h9l-2.5-2.5M13 10.5H4l2.5 2.5",
  sheet: "M4 2.5h6l2 2v9H4zM6 6.5h4M6 9h4M6 11.5h2.5",
  export: "M8 9.5v-7M5 5l3-3 3 3M3 9v4.5h10V9",
  more: "M3.5 8h.01M8 8h.01M12.5 8h.01",
};

export function NavIcon({ name }: { name: NavIconName }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 16 16"
      className="h-[18px] w-[18px] shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth={name === "more" ? 2.25 : 1}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
