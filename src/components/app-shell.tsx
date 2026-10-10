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
import { LeagueLinksProvider } from "@/components/league-links";
import { ThemeSwitch } from "@/components/theme-switch";
import { logout } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { readShellLeagues, type LeagueLink } from "@/lib/leagues/queries";
import { countMappingQueue } from "@/lib/mapping/queries";
import { EMPTY_QUEUE, queueTotal } from "@/lib/mapping/queue";
import {
  navFor,
  tabsFor,
  type NavGroup,
  type NavItem,
  type NavKey,
  type NavLeague,
} from "@/lib/nav/items";
import { leagueHref } from "@/lib/nav/urls";
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
  "absolute z-50 flex flex-col rounded-xl border border-panel-border bg-stock-panel p-2";

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
  const mappingWaiting = manager && session
    ? queueTotal(await countMappingQueue(session.user.id).catch(() => EMPTY_QUEUE))
    : 0;
  const groups = navFor({ league, isRosterManager: manager, mappingWaiting });
  const tabs = tabsFor(groups);
  // From `lg` the sidebar carries the masthead and the switcher, so the header
  // is only drawn while the panel still needs its toggle.
  const headerHidden = !panel ? "lg:hidden" : panelDocked ? "xl:hidden" : "";
  const account = session?.user.name || session?.user.email || "Account";

  const body = (
    <>
      <div className="flex min-h-0 flex-1">
        <aside
          data-testid="sidebar"
          className="sticky top-0 hidden h-dvh w-60 shrink-0 flex-col border-r border-panel-border bg-stock-sunk px-4 py-3 lg:flex"
        >
          <Masthead />
          <div className="mt-2">
            <LeagueSwitcher leagues={leagues} league={league} testId="league-switcher" />
          </div>
          <nav aria-label="Main" className="mt-3 min-h-0 flex-1 overflow-y-auto" tabIndex={0}>
            <SidebarNavGroups groups={groups} current={current} />
          </nav>
          <div className="mt-1.5 flex items-center gap-1 border-t border-rail/40">
            <div className="min-w-0 flex-1">
              <AccountMenu account={account} />
            </div>
            <ThemeSwitch testId="theme-switch" variant="popover" />
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <header
            data-testid="shell-header"
            className={`border-b border-panel-border bg-stock ${headerHidden}`}
          >
            <div className="flex min-h-14 items-center justify-between gap-3 px-5 py-2 sm:px-8">
              <div className="min-w-0 shrink-0 lg:hidden">
                <Masthead compact />
              </div>
              <div className="ml-auto flex shrink-0 items-center gap-2">
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
              className={`mx-auto flex w-full min-w-0 ${MEASURE[measure]} flex-1 flex-col gap-6 px-5 pt-7 pb-28 sm:gap-7 sm:px-8 sm:pt-9 lg:pb-12`}
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

  return (
    <LeagueLinksProvider base={league ? leagueHref(league) : null} basketNews={Boolean(league?.sourceOwned)}>
      {panel ? <PanelProvider docked={panelDocked}>{body}</PanelProvider> : body}
    </LeagueLinksProvider>
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
      className={`flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors ${focusRing} ${
        isHere
          ? "bg-stock-high font-semibold text-ink [&_svg]:text-live"
          : "text-ink-soft hover:bg-stock-panel hover:text-ink"
      }`}
    >
      <NavIcon name={item.icon} />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      {item.note ? (
        <span className="rounded-full bg-live px-2 py-0.5 text-[0.6875rem] leading-4 font-bold text-live-ink">
          {item.note}
        </span>
      ) : null}
    </Link>
  );
}

/** A group header's one link, as an icon with its words for assistive tech: 44px, no row of its own. */
function HeaderAction({
  item,
  current,
  prefix,
  className,
}: {
  item: NavItem;
  current: NavKey | undefined;
  prefix: string;
  className: string;
}) {
  const active = item.key === current;
  return (
    <Link
      href={item.href}
      data-testid={`${prefix}-${item.key}`}
      aria-label={item.label}
      title={item.label}
      aria-current={active ? "page" : undefined}
      className={`flex h-11 w-11 items-center justify-center rounded-md transition-colors hover:bg-stock-panel hover:text-ink ${active ? "text-ink" : "text-ink-soft"} ${focusRing} ${className}`}
    >
      <NavIcon name={item.icon} />
    </Link>
  );
}

function SidebarNavGroups({
  groups,
  current,
}: {
  groups: readonly NavGroup[];
  current: NavKey | undefined;
}) {
  return (
    <>
      {groups.map((group, index) => (
        // The header's link sits beside the summary, not inside it: a link
        // inside a summary is a control inside a control.
        <div key={group.id} className="relative border-t border-panel-border first:border-0">
          <details
            name="sidebar-nav"
            open={group.items.some((item) => item.key === current) || group.action?.key === current || (!current && index === 0)}
            className="group"
          >
            <summary
              data-testid={`nav-group-${group.id}`}
              className={`slot-label flex min-h-9 list-none items-center justify-between rounded-md px-3 text-ink-soft transition-colors hover:bg-stock-panel hover:text-ink group-open:text-ink [&::-webkit-details-marker]:hidden ${focusRing}`}
            >
              <span id={`nav-group-label-${group.id}`} className="truncate">{group.label}</span>
              <span aria-hidden="true" className="text-base transition-transform group-open:rotate-90">›</span>
            </summary>
            <ul role="list" aria-labelledby={`nav-group-label-${group.id}`}>
              {group.items.map((item) => (
                <li key={item.key}>
                  <NavLink item={item} current={current} prefix="nav" />
                </li>
              ))}
            </ul>
          </details>
          {group.action ? (
            <HeaderAction item={group.action} current={current} prefix="nav" className="absolute top-[-4px] right-6" />
          ) : null}
        </div>
      ))}
    </>
  );
}

/**
 * The groups as labelled lists. The label is a `<p>` rather than a heading:
 * the nav comes before every page's `h1`, and headings there would open each
 * page's outline with the sidebar instead of the page.
 *
 * `prefix` keeps the More sheet's ids and test ids distinct from the sidebar's
 * inline disclosures, which remain in the DOM at phone widths.
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
        <div key={group.id} className="flex flex-col gap-1 border-t border-panel-border pt-3 first:border-0 first:pt-0">
          <div className="flex items-center justify-between">
            <p id={`${prefix}-group-${group.id}`} className="slot-label truncate px-3 text-ink-soft">
              {group.label}
            </p>
            {group.action ? <HeaderAction item={group.action} current={current} prefix={prefix} className="-my-3" /> : null}
          </div>
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
      buttonClassName={`flex min-h-11 min-w-11 items-center justify-between gap-2 rounded-lg border border-panel-border bg-stock-panel px-3 text-sm font-semibold text-ink transition-colors hover:border-rule-strong ${focusRing} ${
        compact ? "max-w-40" : "w-full"
      }`}
      panelClassName={`${POPOVER} mt-1 gap-1 ${
        compact ? "right-0 w-64" : "left-0 w-full"
      }`}
    >
      <p className="slot-label px-1">Your leagues</p>
      <ul role="list" className="flex flex-col">
        {leagues.map((row) => (
          <li key={row.id}>
            <Link
              href={leagueHref(row)}
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
      buttonClassName={`slot-label flex min-h-11 w-full min-w-11 items-center justify-between gap-2 px-3 text-ink transition-colors hover:text-ink ${focusRing}`}
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
      isHere ? "border-live font-semibold text-ink [&_svg]:text-live" : "border-transparent text-ink-soft hover:text-ink"
    }`;
  return (
    <nav
      aria-label="Tabs"
      data-testid="bottom-tabs"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-panel-border bg-stock-sunk pb-[env(safe-area-inset-bottom)] lg:hidden"
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
            panelClassName="fixed inset-x-0 bottom-(--tabs-height) z-50 flex max-h-[75dvh] flex-col gap-6 overflow-y-auto border-t border-rule-strong bg-stock-panel px-4 py-4"
          >
            <NavGroups groups={groups} current={current} prefix="more" />
            <div className="flex flex-col gap-1 border-t border-rail/40 pt-3">
              <p className="slot-label truncate px-3 text-ink">{account}</p>
              <div className="px-3 pb-1">
                <ThemeSwitch testId="theme-switch-more" variant="segmented" />
              </div>
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
      return "Players";
    case "matchday":
      return "Live";
    case "standings":
      return "Table";
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
