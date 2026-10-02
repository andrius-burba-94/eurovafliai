/**
 * What the app shell's navigation contains — slice 11.1, ADR-0008.
 *
 * One pure function behind every rendering of the nav: the sidebar, the phone's
 * tab bar and its More menu all draw `navFor`'s output, so a destination cannot
 * exist in one and be missing from another.
 *
 * It offers only what the viewer can open. Each rule below mirrors the gate on
 * the page it links to; a link that answers 404 is a nav item lying about the
 * app.
 */
import type { LeagueWithMembers } from "@/lib/leagues/types";
import { leagueHref, teamHref } from "@/lib/nav/urls";

export type NavKey =
  | "leagues"
  | "pool"
  | "news"
  | "mapping"
  | "import-players"
  | "import-stats"
  | "league-home"
  | "draft"
  | "order"
  | "team"
  | "lineup"
  | "matchday"
  | "standings"
  | "recap"
  | "trades"
  | "stats"
  | "sheet"
  | "export";

export type NavIconName =
  | "home"
  | "leagues"
  | "pool"
  | "news"
  | "mapping"
  | "import"
  | "draft"
  | "order"
  | "team"
  | "lineup"
  | "matchday"
  | "standings"
  | "recap"
  | "trades"
  | "stats"
  | "sheet"
  | "export"
  | "more";

export type NavItem = {
  readonly key: NavKey;
  readonly href: string;
  readonly label: string;
  readonly icon: NavIconName;
  /** A status said in words beside the label — "Live" while a draft runs. */
  readonly note?: string;
};

export type NavGroup = {
  readonly id: "league" | "drafts" | "global";
  readonly label: string;
  readonly items: readonly NavItem[];
};

export type NavLeague = {
  readonly id: string;
  /** The league's address segment; empty until a slug is written (S28). */
  readonly slug?: string;
  readonly name: string;
  readonly status: "setup" | "drafting" | "season" | "complete";
  /** The viewer's membership, or null for a commissioner who never took one. */
  readonly youMemberId: string | null;
  readonly youMemberSlug?: string;
  readonly isCommissioner: boolean;
  /** Commissioner, or a member granted the league's management powers. */
  readonly canManage: boolean;
  /** The order has been drawn, so `/order` has a ceremony to show. */
  readonly rolled: boolean;
};

/** The nav's view of a league, from what every league page already reads. */
export function navLeagueFrom(data: LeagueWithMembers): NavLeague {
  const you = data.members.find((member) => member.isYou) ?? null;
  return {
    id: data.league.id,
    slug: data.league.slug ?? "",
    name: data.league.name,
    status: data.league.status,
    youMemberId: you?.id ?? null,
    youMemberSlug: you?.slug ?? "",
    isCommissioner: data.isCommissioner,
    canManage: data.isCommissioner || Boolean(you?.canManage),
    rolled: Boolean(data.settings.rolled_at),
  };
}

export type NavInput = {
  readonly league?: NavLeague | null;
  /** Commissions a league or deputises in one — `canManageRosters`. */
  readonly isRosterManager: boolean;
  /** Questions waiting in player mapping, said beside it for a manager. */
  readonly mappingWaiting?: number;
};

function leagueItems(league: NavLeague): NavItem[] {
  const base = leagueHref(league);
  const member = league.youMemberId !== null;
  const inSeason = league.status === "season" || league.status === "complete";
  const items: NavItem[] = [
    { key: "league-home", href: base, label: "League Home", icon: "home" },
  ];

  if (inSeason && member) {
    items.push(
      {
        key: "team",
        href: teamHref(league, { id: league.youMemberId!, slug: league.youMemberSlug }),
        label: "My Team",
        icon: "team",
      },
      { key: "lineup", href: `${base}/lineup`, label: "Lineup", icon: "lineup" },
      { key: "matchday", href: `${base}/matchday`, label: "Live", icon: "matchday" },
      {
        key: "standings",
        href: `${base}/standings`,
        label: "Standings",
        icon: "standings",
      },
      { key: "recap", href: `${base}/recap`, label: "Recap", icon: "recap" },
      { key: "trades", href: `${base}/transactions`, label: "Trades", icon: "trades" },
      { key: "stats", href: `${base}/stats`, label: "Stats", icon: "stats" },
    );
  }

  if (inSeason && !member && league.canManage) {
    items.push({ key: "trades", href: `${base}/transactions`, label: "Trades", icon: "trades" });
  }

  // Inside a league the pool is one of its pages, so opening it, or a player
  // from it, never drops the league from the sidebar.
  items.push({ key: "pool", href: `${base}/players`, label: "Player Pool", icon: "pool" });

  return items;
}

function draftItems(league: NavLeague): NavItem[] {
  const base = leagueHref(league);
  const items: NavItem[] = [];
  if (league.status === "drafting" || league.status === "season" || league.status === "complete") {
    items.push({
      key: "draft", href: `${base}/draft`, label: "Draft Room", icon: "draft",
      note: league.status === "drafting" ? "Live" : undefined,
    });
  }
  if (league.rolled) items.push({ key: "order", href: `${base}/order`, label: "Draft Order", icon: "order" });
  // A cheat sheet drives autodraft, so it earns a place only until the board
  // is full. Export is a download on the board and standings, not a place.
  if (league.youMemberId && (league.status === "setup" || league.status === "drafting")) {
    items.push({ key: "sheet", href: `${base}/sheet`, label: "Cheat Sheet", icon: "sheet" });
  }
  return items;
}

const GLOBAL_ITEMS: readonly NavItem[] = [
  { key: "leagues", href: "/", label: "Your leagues", icon: "leagues" },
  { key: "pool", href: "/players", label: "Player Pool", icon: "pool" },
  { key: "news", href: "/players/news", label: "Injury News", icon: "news" },
];

const MANAGE_ITEMS: readonly NavItem[] = [
  {
    key: "mapping",
    href: "/players/mapping",
    label: "Player mapping",
    icon: "mapping",
  },
  {
    key: "import-players",
    href: "/players/import",
    label: "Import players",
    icon: "import",
  },
  {
    key: "import-stats",
    href: "/stats/import",
    label: "Import stats",
    icon: "import",
  },
];

export function navFor({ league, isRosterManager, mappingWaiting = 0 }: NavInput): NavGroup[] {
  const groups: NavGroup[] = [];
  if (league) {
    groups.push({ id: "league", label: "League", items: leagueItems(league) });
    const drafts = draftItems(league);
    if (drafts.length > 0) groups.push({ id: "drafts", label: "Drafts", items: drafts });
  }
  // The roster tools work on the EuroLeague's data, so a manager finds them
  // in its group rather than under a fourth header: with the pool inside the
  // league (S29) a fourth header pushed the season nav into a scroll.
  const manage = isRosterManager
    ? MANAGE_ITEMS.map((item) =>
        item.key === "mapping" && mappingWaiting > 0 ? { ...item, note: String(mappingWaiting) } : item,
      )
    : [];
  groups.push({
    id: "global",
    label: "EuroLeague",
    items: [...(league ? GLOBAL_ITEMS.filter((item) => item.key !== "pool") : GLOBAL_ITEMS), ...manage],
  });
  return groups;
}

/**
 * The phone's four tabs, in order. *More* is the shell's fifth and is not an
 * item here: it opens the full nav rather than going anywhere.
 *
 * Inside a league the tabs are what a member opens on a match night: Home,
 * then the one thing the league is doing now — while drafting the room and the
 * sheet, in season the lineup, the live scores and the table (ADR-0011). A
 * slot with nothing to hold is filled from the global group so the bar keeps
 * four targets.
 */
export function tabsFor(groups: readonly NavGroup[]): NavItem[] {
  const all = groups.flatMap((group) => group.items);
  const byKey = new Map(all.map((item) => [item.key, item]));
  const wanted: NavKey[] = byKey.has("league-home")
    ? byKey.get("draft")?.note
      ? ["league-home", "draft", "sheet", "pool"]
      : ["league-home", "lineup", "matchday", "standings", "team", "pool"]
    : ["leagues", "pool", "news"];

  const tabs: NavItem[] = [];
  for (const key of wanted) {
    const item = byKey.get(key);
    if (!item) continue;
    // In season the lineup is the act, and the board is history; the draft
    // item only earns a tab while it is live.
    if (key === "draft" && !item.note) continue;
    tabs.push(item);
    if (tabs.length === 4) return tabs;
  }
  for (const item of all) {
    if (tabs.length === 4) break;
    if (!tabs.includes(item)) tabs.push(item);
  }
  return tabs;
}
