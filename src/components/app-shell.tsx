import Link from "next/link";
import type { ReactNode } from "react";

import { Masthead, MEASURE, type Measure } from "@/components/board";
import { Menu } from "@/components/menu";
import { NavIcon } from "@/components/nav-icons";
import {
  PanelFrame,
  PanelProvider,
  PanelToggle,
} from "@/components/shell-panel";
import { logout } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { readShellLeagues, type LeagueLink } from "@/lib/leagues/queries";
import {
  navFor,
  tabsFor,
  type NavGroup,
  type NavItem,
  type NavKey,
  type NavLeague,
} from "@/lib/nav/items";
/**
 * The app shell — slice 11.1, ADR-0008.
 *
 * Every signed-in page renders this instead of a rail and a sheet: a sidebar
 * from `lg`, a header on every width, an optional side panel (a column from
 * `xl`, a sheet below it) and a tab bar below `lg`. What the nav holds comes
 * from `navFor`, so the three places it is drawn cannot disagree.
 *
 * Rendered by the page rather than by a route layout, because a layout cannot
 * see which page it wraps and is kept across navigation — a league that moved
 * from drafting to season would keep offering a live room.
 */
/** The side panel's sheet material, at menu size — not a framed Bank. */
const POPOVER =
  "absolute z-50 flex flex-col border border-rule-strong bg-stock-panel p-2";

const focusRing =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live";

export async function AppShell({
  children,
  current,
  league = null,
  panel,
  panelLabel = "Players, schedule and news",
  panelToggle = "Players",
  panelDocked = true,
  measure = "column",
  testId,
}: {
  children: ReactNode;
  /** Which destination this page is. Undefined for a page that is none of them. */
  current?: NavKey;
  league?: NavLeague | null;
  /** The side panel's body, for the pages that have one. */
  panel?: ReactNode;
  panelLabel?: string;
  /** The header button's word for the panel. */
  panelToggle?: string;
  /** False keeps the panel a sheet at every width — see `PanelProvider`. */
  panelDocked?: boolean;
  measure?: Measure;
  testId?: string;
}) {
  const [session, { leagues, isRosterManager: manager }] = await Promise.all([
    getSession(),
    readShellLeagues(),
  ]);
  const groups = navFor({ league, isRosterManager: manager });
  const tabs = tabsFor(groups);
  const here = groups
    .flatMap((group) => group.items)
    .find((item) => item.key === current);
  const account = session?.user.name || session?.user.email || "Account";

  const body = (
    <>
      <div className="flex min-h-0 flex-1">
        <aside
          data-testid="sidebar"
          className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col gap-6 overflow-y-auto border-r border-rail/40 px-4 py-4 lg:flex"
        >
          <Masthead />
          <LeagueSwitcher leagues={leagues} league={league} testId="league-switcher" />
          <nav aria-label="Main" className="flex flex-1 flex-col gap-6">
            <NavGroups groups={groups} current={current} prefix="nav" />
          </nav>
          <AccountMenu account={account} />
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header className="border-b border-rail/40">
            <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-2 sm:px-8">
              <div className="min-w-0 lg:hidden">
                <Masthead compact />
              </div>
              <p
                data-testid="shell-here"
                className="slot-label hidden min-w-0 truncate lg:block"
              >
                {league ? (
                  <span className="text-ink">{league.name}</span>
                ) : (
                  <span className="text-ink">Euroleague 2026&ndash;27</span>
                )}
                {here && here.key !== "league-home" ? (
                  <> &middot; {here.label}</>
                ) : null}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <div className="lg:hidden">
                  <LeagueSwitcher
                    leagues={leagues}
                    league={league}
                    compact
                    testId="league-switcher-compact"
                  />
                </div>
                {panel ? <PanelToggle label={panelToggle} /> : null}
              </div>
            </div>
          </header>

          <div className="flex min-w-0 flex-1">
            <main
              id="main"
              data-testid={testId}
              className={`mx-auto flex w-full min-w-0 ${MEASURE[measure]} flex-1 flex-col gap-8 px-5 pt-8 pb-28 sm:gap-slot sm:px-8 sm:pt-12 lg:pb-12`}
            >
              {children}
            </main>
            {panel ? <PanelFrame label={panelLabel}>{panel}</PanelFrame> : null}
          </div>
        </div>
      </div>

      <BottomTabs
        tabs={tabs}
        groups={groups}
        current={current}
        account={account}
      />
    </>
  );

  return panel ? (
    <PanelProvider docked={panelDocked}>{body}</PanelProvider>
  ) : (
    body
  );
}

function NavLink({
  item,
  current,
  prefix,
}: {
  item: NavItem;
  current: NavKey | undefined;
  prefix: string;
}) {
  const isHere = item.key === current;
  return (
    <Link
      href={item.href}
      data-testid={`${prefix}-${item.key}`}
      aria-current={isHere ? "page" : undefined}
      className={`flex min-h-11 items-center gap-3 border-l-2 px-3 text-sm transition-colors ${focusRing} ${
        isHere
          ? "border-ink bg-ink/5 text-ink"
          : "border-transparent text-ink-soft hover:bg-ink/5 hover:text-ink"
      }`}
    >
      <NavIcon name={item.icon} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.note ? <span className="slot-label text-ink">{item.note}</span> : null}
    </Link>
  );
}

/**
 * The groups as labelled lists. The label is a `<p>` rather than a heading:
 * the nav comes before every page's `h1`, and headings there would open each
 * page's outline with the sidebar instead of the page.
 *
 * `prefix` keeps ids and test ids unique — the sidebar and the phone's More
 * sheet both draw this, and a hidden sidebar is still in the DOM.
 */
function NavGroups({
  groups,
  current,
  prefix,
}: {
  groups: readonly NavGroup[];
  current: NavKey | undefined;
  prefix: string;
}) {
  return (
    <>
      {groups.map((group) => (
        <div key={group.id} className="flex flex-col gap-1">
          <p id={`${prefix}-group-${group.id}`} className="slot-label truncate px-3">
            {group.label}
          </p>
          <ul
            role="list"
            aria-labelledby={`${prefix}-group-${group.id}`}
            className="flex flex-col"
          >
            {group.items.map((item) => (
              <li key={item.key}>
                <NavLink item={item} current={current} prefix={prefix} />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  );
}

function LeagueSwitcher({
  leagues,
  league,
  compact = false,
  testId,
}: {
  leagues: readonly LeagueLink[];
  league: NavLeague | null;
  compact?: boolean;
  testId: string;
}) {
  const label = league ? league.name : "Choose a league";
  return (
    <Menu
      testId={testId}
      label={
        <>
          <span className="min-w-0 truncate">{compact ? (league ? league.name : "Leagues") : label}</span>
          <span aria-hidden="true" className="text-ink-soft">
            &#9662;
          </span>
          <span className="sr-only">, switch league</span>
        </>
      }
      buttonClassName={`slot-label flex min-h-11 min-w-11 items-center justify-between gap-2 border border-ink/50 px-3 text-ink transition-colors hover:border-ink/80 ${focusRing} ${
        compact ? "max-w-40" : "w-full"
      }`}
      panelClassName={`${POPOVER} mt-1 w-64 gap-1 ${
        compact ? "right-0" : "left-0"
      }`}
    >
      <p className="slot-label px-1">Your leagues</p>
      <ul role="list" className="flex flex-col">
        {leagues.map((row) => (
          <li key={row.id}>
            <Link
              href={`/leagues/${row.id}`}
              aria-current={row.id === league?.id ? "page" : undefined}
              className={`flex min-h-11 items-center border-l-2 px-3 text-sm transition-colors ${focusRing} ${
                row.id === league?.id
                  ? "border-ink text-ink"
                  : "border-transparent text-ink-soft hover:text-ink"
              }`}
            >
              <span className="min-w-0 truncate">{row.name}</span>
            </Link>
          </li>
        ))}
        <li>
          <Link
            href="/"
            className={`slot-label flex min-h-11 items-center px-3 text-ink transition-colors ${focusRing}`}
          >
            {leagues.length === 0 ? "Start or join a league" : "All leagues"} &rarr;
          </Link>
        </li>
      </ul>
    </Menu>
  );
}

function SignOut() {
  return (
    <form action={logout}>
      <button
        type="submit"
        data-testid="logout"
        className={`slot-label flex min-h-11 w-full min-w-11 items-center px-3 text-ink transition-colors hover:bg-ink/5 ${focusRing}`}
      >
        Sign out
      </button>
    </form>
  );
}

function AccountMenu({ account }: { account: string }) {
  return (
    <Menu
      testId="account-menu"
      label={
        <>
          <span className="min-w-0 truncate">{account}</span>
          <span aria-hidden="true" className="text-ink-soft">
            &#9652;
          </span>
          <span className="sr-only">, account</span>
        </>
      }
      buttonClassName={`slot-label flex min-h-11 w-full min-w-11 items-center justify-between gap-2 border-t border-rail/40 px-3 pt-2 text-ink transition-colors hover:text-ink ${focusRing}`}
      panelClassName={`${POPOVER} bottom-full left-0 mb-1 w-full`}
    >
      <SignOut />
    </Menu>
  );
}

function BottomTabs({
  tabs,
  groups,
  current,
  account,
}: {
  tabs: readonly NavItem[];
  groups: readonly NavGroup[];
  current: NavKey | undefined;
  account: string;
}) {
  const tabClass = (isHere: boolean) =>
    `flex min-h-14 w-full min-w-11 flex-col items-center justify-center gap-1 border-t-2 px-1 text-[0.6875rem] leading-4 transition-colors ${focusRing} ${
      isHere ? "border-ink text-ink" : "border-transparent text-ink-soft hover:text-ink"
    }`;
  return (
    <nav
      aria-label="Tabs"
      data-testid="bottom-tabs"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-rail/40 bg-stock pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul role="list" className="grid grid-cols-5">
        {tabs.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              data-testid={`tab-${item.key}`}
              aria-current={item.key === current ? "page" : undefined}
              className={tabClass(item.key === current)}
            >
              <NavIcon name={item.icon} />
              <span className="max-w-full truncate">{shortLabel(item)}</span>
            </Link>
          </li>
        ))}
        {Array.from({ length: 4 - tabs.length }, (_, index) => (
          <li key={`gap-${index}`} aria-hidden="true" />
        ))}
        <li>
          <Menu
            testId="more-menu"
            label={
              <>
                <NavIcon name="more" />
                <span>More</span>
              </>
            }
            buttonClassName={tabClass(false)}
            panelClassName="fixed inset-x-0 bottom-[calc(3.5rem+env(safe-area-inset-bottom))] z-50 flex max-h-[75dvh] flex-col gap-6 overflow-y-auto border-t border-rule-strong bg-stock-panel px-4 py-4"
          >
            <NavGroups groups={groups} current={current} prefix="more" />
            <div className="flex flex-col gap-1 border-t border-rail/40 pt-3">
              <p className="slot-label truncate px-3 text-ink">{account}</p>
              <SignOut />
            </div>
          </Menu>
        </li>
      </ul>
    </nav>
  );
}

/** Five tabs on a 360px phone leave ~70px each; the long labels step down. */
function shortLabel(item: NavItem): string {
  switch (item.key) {
    case "league-home":
      return "Home";
    case "draft":
      return item.note ? "Draft" : "Board";
    case "team":
      return "My team";
    case "leagues":
      return "Leagues";
    case "pool":
      return "Pool";
    case "news":
      return "News";
    case "mapping":
      return "Mapping";
    case "sheet":
      return "Sheet";
    default:
      return item.label;
  }
}
