import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Bank,
  CardName,
  PositionPatch,
  Sheet,
  Slot,
  Slots,
  TopRail,
} from "@/components/board";
import { logout } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { listMyLeagues } from "@/lib/leagues/queries";

import { LeagueForms } from "./league-forms";

/**
 * Your leagues: the signed-in home. Create one as commissioner, or join a
 * friend's with its invite code.
 *
 * Each league is a slot on the board, and the run continues into the free slots
 * below it, so the surface shows the board's shape rather than a list that
 * stops. A league still in setup is ruled dashed; every established league is
 * ruled solid. Drafting remains a status word here, never the clock's marker.
 */

/** How many free slots to show under the run. Enough to read as a board. */
const FREE_SLOTS_SHOWN = 3;

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const leagues = await listMyLeagues();

  return (
    <>
      <TopRail
        action={
          <div className="flex flex-col items-end gap-1">
            <span className="slot-label max-w-40 truncate text-ink">
              {session.user.name || session.user.email}
            </span>
            <nav aria-label="Account" className="flex items-center gap-1">
              <Link
                href="/"
                aria-current="page"
                className="slot-label inline-flex min-h-11 min-w-11 items-center justify-center px-2 text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Leagues
              </Link>
              <Link
                href="/players"
                className="slot-label inline-flex min-h-11 min-w-11 items-center justify-center px-2 whitespace-nowrap transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Pool
              </Link>
              <form action={logout}>
                <button
                  type="submit"
                  data-testid="logout"
                  className="slot-label inline-flex min-h-11 min-w-11 items-center justify-center px-2 whitespace-nowrap transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  Sign out
                </button>
              </form>
            </nav>
          </div>
        }
      />
      <Sheet testId="app-shell">
        <div className="flex max-w-xl flex-col gap-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Your leagues
          </h1>
          <p className="text-ink-soft">
            Open the board for draft night, or check where the season stands.
          </p>
        </div>

        <Bank
          label="The league board"
          framed
          aside={
            leagues.length > 0 ? `${leagues.length} on the board` : "none yet"
          }
        >
          <Slots testId="leagues-list">
            {leagues.map((league) => (
              <Slot
                key={league.id}
                state={league.status === "setup" ? "waiting" : "filled"}
              >
                <Link
                  href={`/leagues/${league.id}`}
                  className="-mx-3 -my-3 flex min-h-11 flex-1 flex-col gap-2 px-3 py-3 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  <span className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <CardName>{league.name}</CardName>
                    <span className="slot-label">
                      {league.season} &middot; {league.status}
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="slot-label">Your roster</span>
                      {(["G", "F", "C"] as const).map((position) => (
                        <PositionPatch
                          key={position}
                          position={position}
                          count={`${league.positionCounts[position]}/${league.rosterTemplate[position]}`}
                          label={`${league.positionCounts[position]} of ${league.rosterTemplate[position]} ${
                            position === "G"
                              ? "guards"
                              : position === "F"
                                ? "forwards"
                                : "centers"
                          }`}
                        />
                      ))}
                    </span>
                    <span className="slot-label text-ink">Open league</span>
                  </span>
                </Link>
              </Slot>
            ))}
            {leagues.length === 0 ? (
              <Slot state="waiting">
                <span
                  data-testid="leagues-empty"
                  className="text-sm text-ink-soft"
                >
                  No leagues yet. Start one below, or join a friend&rsquo;s with
                  their invite code.
                </span>
              </Slot>
            ) : null}
            {Array.from({ length: FREE_SLOTS_SHOWN }, (_, index) => (
              <Slot key={`free-${index}`} state="waiting">
                <span className="slot-label text-ink-faint">
                  Slot {String(leagues.length + index + 1).padStart(2, "0")}
                </span>
              </Slot>
            ))}
          </Slots>
        </Bank>

        <LeagueForms hasLeagues={leagues.length > 0} />
      </Sheet>
    </>
  );
}
