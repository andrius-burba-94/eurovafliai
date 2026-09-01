import Link from "next/link";
import { redirect } from "next/navigation";

import {
  BackArrow,
  Bank,
  CardName,
  PositionPatch,
  Sheet,
  Slot,
  Slots,
  TopRail,
} from "@/components/board";
import { canManageRosters } from "@/lib/rosters/actions";
import { getPool } from "@/lib/rosters/queries";

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
 */
export default async function PlayersPage() {
  const pool = await getPool();
  if (!pool) redirect("/login?error=unauthorized");

  const { counts, authority, lastImport, clubs } = pool;
  // Only shown to people who could use it, so the page does not dangle a door
  // that would only 404 for them.
  const canImport = await canManageRosters();

  return (
    <>
      <TopRail
        action={
          <Link
            href="/"
            className="slot-label inline-flex items-center gap-1.5 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <BackArrow />
            Leagues
          </Link>
        }
      />
      <Sheet testId="players">
        <div className="flex flex-col gap-4">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            The pool
          </h1>
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

        {counts.total > 0 ? (
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
        ) : null}

        {/* Clubs are ONE run of slots, not twenty sections. As direct children of
            the Sheet they picked up its 2.75rem section gap, which broke the
            board's continuous ruling into twenty floating strips — the same
            continuity the lobby's slot run depends on. */}
        <Bank label="Clubs" aside={`${clubs.length}`}>
          <div className="flex flex-col border-b border-rule-strong">
            {/* One disclosure per club, closed by default. Listing all 324 players
            flat made an 18,000px page — forty-odd phone screens of scrolling to
            reach Zalgiris. Native <details>, so it needs no JavaScript, no
            animation and no state; Phase 3.3's filters and fuzzy search are what
            eventually make this browsable rather than merely navigable. */}
            {clubs.map((club) => (
              <details key={club.code} className="group">
                <summary className="slot-waiting flex cursor-pointer list-none items-baseline justify-between gap-4 px-3 py-3 transition-colors hover:bg-ink/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live">
                  <span className="flex flex-wrap items-baseline gap-x-3">
                    <CardName>{club.code}</CardName>
                    <span className="text-sm text-ink-soft">{club.name}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="slot-label">{club.players.length}</span>
                    <span className="slot-label text-ink-faint group-open:hidden">
                      show
                    </span>
                    <span className="slot-label hidden text-ink-faint group-open:inline">
                      hide
                    </span>
                  </span>
                </summary>
                <Slots testId="club-roster">
                  {club.players.map((player) => (
                    <Slot
                      key={player.id}
                      testId="pool-player"
                      state={player.status === "left" ? "waiting" : "filled"}
                    >
                      <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <CardName>{player.name}</CardName>
                        {player.dorsal ? (
                          <span className="slot-label">#{player.dorsal}</span>
                        ) : null}
                      </span>
                      <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <PositionPatch position={player.position} />
                        {player.status !== "active" ? (
                          <span className="slot-label">{player.status}</span>
                        ) : null}
                        {/* Source and lock badges: which front door wrote this row,
                        and whether a commissioner has claimed it. */}
                        <span className="slot-label text-ink-faint">
                          {player.source}
                        </span>
                        {player.manual_lock ? (
                          <span className="slot-label text-live">locked</span>
                        ) : null}
                        {!player.person_code ? (
                          <span
                            className="slot-label text-ink-faint"
                            title="No Euroleague person code yet — matched by name and club"
                          >
                            no code
                          </span>
                        ) : null}
                      </span>
                    </Slot>
                  ))}
                </Slots>
              </details>
            ))}
          </div>
        </Bank>
      </Sheet>
    </>
  );
}
