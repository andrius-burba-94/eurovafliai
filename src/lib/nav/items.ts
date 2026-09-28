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
  readonly id: "league" | "drafts" | "global" | "manage";
  readonly label: string;
  readonly items: readonly NavItem[];
};

export type NavLeague = {
  readonly id: string;
  readonly name: string;
  readonly status: "setup" | "drafting" | "season" | "complete";
  /** The viewer's membership, or null for a commissioner who never took one. */
  readonly youMemberId: string | null;
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
    name: data.league.name,
    status: data.league.status,
    youMemberId: you?.id ?? null,
    isCommissioner: data.isCommissioner,
    canManage: data.isCommissioner || Boolean(you?.canManage),
    rolled: Boolean(data.settings.rolled_at),
  };
}

export type NavInput = {
  readonly league?: NavLeague | null;
  /** Commissions a league or deputises in one — `canManageRosters`. */
  readonly isRosterManager: boolean;
};

function leagueItems(league: NavLeague): NavItem[] {
  const base = `/leagues/${league.id}`;
  const member = league.youMemberId !== null;
  const inSeason = league.status === "season" || league.status === "complete";
  const items: NavItem[] = [
    { key: "league-home", href: base, label: "League Home", icon: "home" },
  ];

  if (inSeason && member) {
    items.push(
      {
        key: "team",
        href: `${base}/teams/${league.youMemberId}`,
        label: "My Team",
        icon: "team",
      },
      { key: "lineup", href: `${base}/lineup`, label: "Lineup", icon: "lineup" },
      { key: "matchday", href: `${base}/matchday`, label: "Matchday", icon: "matchday" },
      {
        key: "standings",
        href: `${base}/standings`,
        label: "Standing",
        icon: "standings",
      },
      { key: "recap", href: `${base}/recap`, label: "Recap", icon: "recap" },
      { key: "trades", href: `${base}/transactions`, label: "Trades", icon: "trades" },
    );
  }

  if (inSeason && !member && league.canManage) {
    items.push({ key: "trades", href: `${base}/transactions`, label: "Trades", icon: "trades" });
  }

  return items;
}

function draftItems(league: NavLeague): NavItem[] {
  const base = `/leagues/${league.id}`;
  const items: NavItem[] = [];
  if (league.status === "drafting" || league.status === "season" || league.status === "complete") {
    items.push({
      key: "draft", href: `${base}/draft`, label: "Draft Room", icon: "draft",
      note: league.status === "drafting" ? "Live" : undefined,
    });
  }
  if (league.rolled) items.push({ key: "order", href: `${base}/order`, label: "Draft Order", icon: "order" });
  if (league.youMemberId) {
    items.push(
      { key: "sheet", href: `${base}/sheet`, label: "Cheat Sheet", icon: "sheet" },
      { key: "export", href: `${base}/export`, label: "Export", icon: "export" },
    );
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

export function navFor({ league, isRosterManager }: NavInput): NavGroup[] {
  const groups: NavGroup[] = [];
  if (league) {
    groups.push({ id: "league", label: "League", items: leagueItems(league) });
    const drafts = draftItems(league);
    if (drafts.length > 0) groups.push({ id: "drafts", label: "Drafts", items: drafts });
  }
  groups.push({ id: "global", label: "EuroLeague", items: GLOBAL_ITEMS });
  if (isRosterManager) {
    groups.push({ id: "manage", label: "Manage", items: MANAGE_ITEMS });
  }
  return groups;
}

/**
 * The phone's four tabs, in order. *More* is the shell's fifth and is not an
 * item here: it opens the full nav rather than going anywhere.
 *
 * Inside a league the tabs are what a member opens on a match night — home,
 * the one thing the league is doing now (the room while drafting, the lineup
 * in season), the table and their own team. A slot with nothing to hold is
 * filled from the global group so the bar keeps four targets.
 */
export function tabsFor(groups: readonly NavGroup[]): NavItem[] {
  const all = groups.flatMap((group) => group.items);
  const byKey = new Map(all.map((item) => [item.key, item]));
  const wanted: NavKey[] = byKey.has("league-home")
    ? byKey.get("draft")?.note
      ? ["draft", "pool", "league-home", "sheet"]
      : ["lineup", "pool", "matchday", "standings", "league-home", "team"]
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
