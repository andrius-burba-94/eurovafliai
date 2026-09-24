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
  readonly id: "league" | "global" | "manage";
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
    { key: "league-home", href: base, label: "League home", icon: "home" },
  ];

  if (league.status === "drafting") {
    items.push({
      key: "draft",
      href: `${base}/draft`,
      label: "Draft room",
      icon: "draft",
      note: "Live",
    });
  } else if (inSeason) {
    items.push({
      key: "draft",
      href: `${base}/draft`,
      label: "Draft board",
      icon: "draft",
    });
  }

  if (inSeason && member) {
    items.push(
      {
        key: "team",
        href: `${base}/teams/${league.youMemberId}`,
        label: "My team",
        icon: "team",
      },
      { key: "lineup", href: `${base}/lineup`, label: "Lineup", icon: "lineup" },
      {
        key: "standings",
        href: `${base}/standings`,
        label: "Standings",
        icon: "standings",
      },
      { key: "recap", href: `${base}/recap`, label: "Recap", icon: "recap" },
    );
  }

  if (inSeason && league.status === "season" && league.canManage) {
    items.push({
      key: "trades",
      href: `${base}/transactions/new`,
      label: "Record a trade",
      icon: "trades",
    });
  }

  if (league.rolled) {
    items.push({
      key: "order",
      href: `${base}/order`,
      label: "Draft order",
      icon: "order",
    });
  }

  if (member) {
    items.push(
      {
        key: "sheet",
        href: `${base}/sheet`,
        label: "Cheat sheet",
        icon: "sheet",
      },
      { key: "export", href: `${base}/export`, label: "Export", icon: "export" },
    );
  }

  return items;
}

const GLOBAL_ITEMS: readonly NavItem[] = [
  { key: "leagues", href: "/", label: "Your leagues", icon: "leagues" },
  { key: "pool", href: "/players", label: "Player pool", icon: "pool" },
  { key: "news", href: "/players/news", label: "Injury news", icon: "news" },
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
    groups.push({ id: "league", label: league.name, items: leagueItems(league) });
  }
  groups.push({ id: "global", label: "Euroleague", items: GLOBAL_ITEMS });
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
    ? ["league-home", "draft", "lineup", "standings", "team"]
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
