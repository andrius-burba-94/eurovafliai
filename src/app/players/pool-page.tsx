import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Bank,
  PositionPatch,
  Slot,
  Slots,
} from "@/components/board";
import { AppShell } from "@/components/app-shell";
import { countMappingQueue } from "@/lib/mapping/queries";
import { EMPTY_QUEUE, queueTotal } from "@/lib/mapping/queue";
import { canManageRosters } from "@/lib/rosters/actions";
import type { NavLeague } from "@/lib/nav/items";
import { getPool } from "@/lib/rosters/queries";

import { PoolBrowser } from "./pool-browser";

/**
 * The pool: every Euroleague player the draft can choose from.
 *
 * Deliberately a plain list. Filters, fuzzy search and "hide drafted" are Phase
 * 3.3, and building half of them here would mean building them twice. What this
 * page owes today is the question a commissioner actually has after running a
 * sync — *did the ingest work, and what did it touch* — which is why the
 * summary sits above the roster and says who holds the authority.
 *
 * Players are grouped by club because that is how a roster is read, and each row
 * carries its source and lock badges (blueprint 2.1).
 *
 * The same page outside a league (`/players`) and inside one
 * (`/l/<league>/players`, S29), where the sidebar keeps the league.
 */
export async function PoolPage({ league }: { league: NavLeague | null }) {
  const pool = await getPool();
  if (!pool) redirect("/login?error=unauthorized");

  const { counts, authority, lastImport, clubs } = pool;
  // Only shown to people who could use it, so the page does not dangle a door
  // that would only 404 for them.
  const canImport = await canManageRosters();
  // The same count the lobby rings, from the same filter, so the page that owns
  // the link and the page that chases it cannot quote different numbers.
  const mappingWaiting = canImport
    ? queueTotal(await countMappingQueue().catch(() => EMPTY_QUEUE))
    : 0;

  return (
    <AppShell current="pool" league={league} measure="wide" testId="players">
      <div className="flex flex-col gap-4">
        <p className="slot-label text-live">{league ? league.name : "EuroLeague"}</p>
        <h1 className="display text-4xl sm:text-5xl">Player pool</h1>
        {counts.total === 0 ? (
          <p className="text-ink-soft">
            No players yet. Run{" "}
            <code className="text-ink">npm run rosters:sync</code> to build
            the pool from the Euroleague API.
          </p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            <span className="slot-label">
              {counts.total} players &middot; {clubs.length} clubs
            </span>
            <span className="flex items-center gap-1.5">
              <PositionPatch position="G" count={counts.byPosition.G} />
              <PositionPatch position="F" count={counts.byPosition.F} />
              <PositionPatch position="C" count={counts.byPosition.C} />
            </span>
          </div>
        )}
      </div>

      <PoolBrowser players={pool.players} clubs={clubs.map((club) => ({ code: club.code, name: club.name }))} />

      {counts.total > 0 ? (
        <details className="group rounded-card border border-panel-border bg-stock-panel px-4 py-2" open={canImport}>
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between text-sm font-semibold [&::-webkit-details-marker]:hidden">
            Where this data comes from
            <span aria-hidden="true" className="text-ink-soft transition-transform group-open:rotate-90">&rsaquo;</span>
          </summary>
        <Bank label="Ingest" aside={`${authority} holds authority`}>
          <Slots>
            <Slot>
              <span className="slot-label">Sources</span>
              <span className="text-sm">
                {Object.entries(counts.bySource)
                  .map(([source, n]) => `${n} ${source}`)
                  .join(" · ")}
              </span>
            </Slot>
            <Slot>
              <span className="slot-label">Without a person code</span>
              <span className="text-sm">
                {counts.withoutPersonCode}
                {/* The number the research says to watch: it falls as clubs
                    register signings, and these players match on normalized
                    name + club until it does. */}
                <span className="text-ink-soft">
                  {" "}
                  &middot; matched by name and club
                </span>
              </span>
            </Slot>
            {counts.locked > 0 ? (
              <Slot>
                <span className="slot-label">Locked corrections</span>
                <span className="text-sm">{counts.locked}</span>
              </Slot>
            ) : null}
            {counts.left > 0 ? (
              <Slot>
                <span className="slot-label">Marked left</span>
                <span className="text-sm">
                  {counts.left}
                  <span className="text-ink-soft">
                    {" "}
                    &middot; kept, not deleted
                  </span>
                </span>
              </Slot>
            ) : null}
            {canImport ? (
              <Slot state="waiting">
                <span className="slot-label">Upload a roster</span>
                <Link
                  href="/players/import"
                  className="text-sm text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  Paste a CSV
                </Link>
              </Slot>
            ) : null}
            {canImport ? (
              <Slot state="waiting">
                <span className="slot-label">Import box scores</span>
                <Link
                  href="/stats/import"
                  className="text-sm text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  Paste a round
                </Link>
              </Slot>
            ) : null}
            {/* Everybody's row, not a manager's: an injury is a drafting
                fact, and the pool prints the word on the player it applies
                to without saying who published it or when. */}
            <Slot state="waiting">
              <span className="slot-label">Injuries and moves</span>
              <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                {counts.unavailable > 0 ? (
                  <span className="text-sm">
                    {counts.unavailable} unavailable
                  </span>
                ) : null}
                <Link
                  href="/players/news"
                  className="text-sm text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  What has been published
                </Link>
              </span>
            </Slot>
            {canImport ? (
              // Struck as a correction once something is standing: this is
              // the row the link already lived on, so the doorbell belongs
              // here rather than in a second notice further up the page.
              <Slot
                state={mappingWaiting > 0 ? "correction" : "waiting"}
                testId="mapping-queue-row"
              >
                <span className="slot-label">Player mapping</span>
                <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  {mappingWaiting > 0 ? (
                    <span className="text-sm">
                      {mappingWaiting} waiting
                    </span>
                  ) : null}
                  <Link
                    href="/players/mapping"
                    className="text-sm text-live underline decoration-live/40 underline-offset-4 transition-colors hover:decoration-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                  >
                    {mappingWaiting > 0 ? "Answer them" : "Names and codes"}
                  </Link>
                </span>
              </Slot>
            ) : null}
            {lastImport ? (
              <Slot state={lastImport.applied ? "filled" : "waiting"}>
                <span className="slot-label">Last import</span>
                <span className="text-sm">
                  {lastImport.source} &middot; {lastImport.season} &middot;{" "}
                  {lastImport.rows} rows &middot;{" "}
                  {lastImport.applied ? "applied" : "report-only"}
                </span>
              </Slot>
            ) : null}
          </Slots>
        </Bank>
        </details>
      ) : null}

    </AppShell>
  );
}
