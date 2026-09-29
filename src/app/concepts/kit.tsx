import type { ReactNode } from "react";

import type { Player, Pos, Team } from "./data";

type IconName =
  | "home"
  | "court"
  | "live"
  | "table"
  | "more"
  | "crown"
  | "spoon"
  | "flame"
  | "ball"
  | "swap"
  | "lock"
  | "left"
  | "right"
  | "bars"
  | "users"
  | "clock"
  | "book"
  | "star";

const PATHS: Record<IconName, string> = {
  home: "M3 10.5 12 3l9 7.5V21h-6v-6H9v6H3z",
  court: "M3 4h18v16H3zM3 12h18M12 4v16M12 9.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5",
  live: "M5 12a7 7 0 0 1 14 0M8 12a4 4 0 0 1 8 0M12 12v8M2 12a10 10 0 0 1 20 0",
  table: "M4 5h16M4 10h16M4 15h16M4 20h16M9 5v15",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  crown: "M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z",
  spoon: "M14.5 3.5c2.5 0 4 2 4 4.5s-2 4.5-4.5 4.5c-.9 0-1.6-.2-2.2-.6L5 18.8 3.7 17.5l6.9-6.8c-.4-.6-.6-1.3-.6-2.2 0-2.6 1.9-5 4.5-5z",
  flame: "M12 3c1 3 5 5 5 10a5 5 0 0 1-10 0c0-2.5 1.5-3.8 2.5-5 .3 1.5 1 2.5 2 3 0-3-.5-5.5.5-8z",
  ball: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M3 12h18M12 3v18M5.6 5.6c3.2 3.2 3.2 9.6 0 12.8M18.4 5.6c-3.2 3.2-3.2 9.6 0 12.8",
  swap: "M4 8h14l-3-3M20 16H6l3 3",
  lock: "M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3",
  left: "M15 5l-7 7 7 7",
  right: "M9 5l7 7-7 7",
  bars: "M5 20V11M10 20V5M15 20v-7M20 20V8",
  users: "M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 7.5M18 14.5a7 7 0 0 1 4 6.5",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
  book: "M4 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H4zM20 4h-5a3 3 0 0 0-3 3",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z",
};

export function Icon({ name, size = 20, className }: { name: IconName; size?: number; className?: string }) {
  const filled = name === "crown" || name === "flame" || name === "star" || name === "spoon";
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      fill={filled ? "currentColor" : "none"}
      stroke={filled ? "none" : "currentColor"}
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}

export function Crest({ team, size = 36 }: { team: Pick<Team, "mono" | "color" | "shape">; size?: number }) {
  return (
    <span
      className="cx-crest"
      data-color={team.color}
      data-shape={team.shape}
      style={{ ["--crest-size" as string]: `${size}px` }}
      aria-hidden="true"
    >
      {team.mono}
    </span>
  );
}

export function TeamName({ team, size = 32, sub }: { team: Team; size?: number; sub?: ReactNode }) {
  return (
    <span className="cx-row" style={{ gap: "0.6rem", minWidth: 0 }}>
      <Crest team={team} size={size} />
      <span style={{ minWidth: 0 }}>
        <span style={{ display: "block", fontWeight: 700, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
          {team.name}
          {team.you ? <span className="cx-chip cx-chip-accent" style={{ marginLeft: "0.4rem", minHeight: "1.2rem" }}>You</span> : null}
        </span>
        {sub ? <span className="cx-small cx-muted">{sub}</span> : null}
      </span>
    </span>
  );
}

export function PosTag({ pos }: { pos: Pos }) {
  return <span className={`cx-pos cx-pos-${pos}`}>{pos}</span>;
}

export function Disc({ player, size = 40, captain = false }: { player: Player; size?: number; captain?: boolean }) {
  return (
    <span className="cx-disc" data-pos={player.pos} style={{ ["--disc" as string]: `${size}px` }} aria-hidden="true">
      {captain ? <span className="cx-armband">C×2</span> : null}
      <span className="cx-disc-pos">{player.pos}</span>
    </span>
  );
}

export function Delta({ value, digits = 1, suffix }: { value: number; digits?: number; suffix?: string }) {
  const cls = value > 0 ? "cx-delta-up" : value < 0 ? "cx-delta-down" : "cx-delta-flat";
  const mark = value > 0 ? "▲" : value < 0 ? "▼" : "•";
  return (
    <span className={`cx-delta ${cls}`}>
      {mark} {Math.abs(value).toFixed(digits)}
      {suffix}
    </span>
  );
}

export function Move({ value }: { value: number }) {
  if (value === 0) return <span className="cx-delta cx-delta-flat" aria-label="no change">–</span>;
  return (
    <span className={`cx-delta ${value > 0 ? "cx-delta-up" : "cx-delta-down"}`} aria-label={value > 0 ? `up ${value}` : `down ${-value}`}>
      {value > 0 ? "▲" : "▼"}
      {Math.abs(value)}
    </span>
  );
}

export function Spark({ values }: { values: number[] }) {
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const points = values
    .map((value, index) => `${(index / (values.length - 1)) * 56},${18 - ((value - min) / span) * 16}`)
    .join(" ");
  return (
    <svg className="cx-spark" viewBox="0 0 56 20" aria-hidden="true">
      <polyline points={points} />
    </svg>
  );
}

export function Stepper({ label }: { label: string }) {
  return (
    <span className="cx-stepper">
      <button type="button" aria-label="Previous round">
        <Icon name="left" size={16} />
      </button>
      <span>{label}</span>
      <button type="button" aria-label="Next round">
        <Icon name="right" size={16} />
      </button>
    </span>
  );
}

export function fmt(value: number, digits = 1): string {
  return value.toFixed(digits);
}

export function playerName(player: Player): string {
  return `${player.first} ${player.last}`;
}

const TABS = [
  { key: "home", label: "Home", icon: "home" },
  { key: "lineup", label: "Lineup", icon: "court" },
  { key: "live", label: "Live", icon: "live" },
  { key: "table", label: "Table", icon: "table" },
  { key: "more", label: "More", icon: "more" },
] as const;

export type Tab = (typeof TABS)[number]["key"];

export function PhoneFrame({ children, tab, title, bare = false }: { children: ReactNode; tab: Tab; title?: ReactNode; bare?: boolean }) {
  if (bare) {
    return (
      <div className="cx-phone" style={{ paddingTop: "2rem" }}>
        <div className="cx-phone-scroll">{children}</div>
      </div>
    );
  }
  return (
    <div className="cx-phone">
      <div className="cx-topbar">
        <span className="cx-wordmark">
          Euro<span>vafliai</span>
        </span>
        {title ?? <span className="cx-chip">Kavos lyga 26–27 ▾</span>}
      </div>
      <div className="cx-phone-scroll">{children}</div>
      <nav className="cx-tabs" aria-label="Tabs">
        {TABS.map((item) => (
          <span key={item.key} className="cx-tab" aria-current={item.key === tab ? "page" : undefined}>
            <Icon name={item.icon} size={20} />
            {item.label}
          </span>
        ))}
      </nav>
    </div>
  );
}

const SIDE = [
  {
    label: "League",
    items: [
      { key: "home", label: "Home", icon: "home" },
      { key: "team", label: "My team", icon: "users" },
      { key: "lineup", label: "Lineup", icon: "court" },
      { key: "live", label: "Live", icon: "live" },
      { key: "table", label: "Standings", icon: "table" },
      { key: "recap", label: "Recap", icon: "book" },
      { key: "trades", label: "Trades", icon: "swap" },
      { key: "stats", label: "Stats", icon: "bars" },
    ],
  },
  {
    label: "Draft",
    items: [{ key: "draft", label: "Draft room", icon: "clock" }],
  },
  {
    label: "EuroLeague",
    items: [
      { key: "pool", label: "Players", icon: "ball" },
      { key: "news", label: "Injuries", icon: "flame" },
    ],
  },
] as const;

export function DesktopFrame({ children, here }: { children: ReactNode; here: string }) {
  return (
    <div className="cx-desktop">
      <aside className="cx-side">
        <span className="cx-wordmark" style={{ fontSize: "1.5rem", padding: "0 0.6rem" }}>
          Euro<span>vafliai</span>
        </span>
        <span className="cx-chip" style={{ justifyContent: "space-between", minHeight: "2.25rem", borderRadius: "0.5rem" }}>
          Kavos lyga 26–27 <span>▾</span>
        </span>
        {SIDE.map((group) => (
          <div key={group.label} className="cx-side-group">
            <span className="cx-side-label">{group.label}</span>
            {group.items.map((item) => (
              <span key={item.key} className="cx-side-item" aria-current={item.key === here ? "page" : undefined}>
                <Icon name={item.icon} size={18} />
                {item.label}
              </span>
            ))}
          </div>
        ))}
      </aside>
      <div className="cx-desktop-main">{children}</div>
    </div>
  );
}
