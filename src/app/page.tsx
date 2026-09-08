import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Bank,
  CardName,
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
 * stops. A league still in setup is ruled dashed; one whose draft is underway
 * is struck in the commissioner's marker.
 */

/** How many free slots to show under the run. Enough to read as a board. */
const FREE_SLOTS_SHOWN = 3;
/** Extra free slots, desktop only: a wide viewport has the height for them. */
const FREE_SLOTS_WIDE = 5;

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const leagues = await listMyLeagues();

  return (
    <>
      <TopRail
        action={
          <span className="flex items-baseline gap-4">
            <Link
              href="/players"
              className="slot-label whitespace-nowrap transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
            >
              Pool
            </Link>
            <form action={logout}>
              <button
                type="submit"
                data-testid="logout"
                className="slot-label whitespace-nowrap transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
              >
                Sign out
                {/* The name is the part that has no room on a phone, and breaking
                  after the middot left it dangling at the end of a line. The
                  season stays; this goes. */}
                <span className="hidden sm:inline">
                  {" "}
                  &middot; {session.user.name || session.user.email}
                </span>
              </button>
            </form>
          </span>
        }
      />
      <Sheet testId="app-shell">
        <Bank
          label="Your leagues"
          aside={
            leagues.length > 0 ? `${leagues.length} on the board` : "none yet"
          }
        >
          <Slots testId="leagues-list">
            {leagues.map((league) => (
              <Slot
                key={league.id}
                state={league.status === "setup" ? "filled" : "live"}
              >
                <Link
                  href={`/leagues/${league.id}`}
                  className="-mx-3 -my-3 flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-3 py-3 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                >
                  <CardName>{league.name}</CardName>
                  <span className="slot-label">
                    {league.season} &middot; {league.status}
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
            {Array.from(
              { length: FREE_SLOTS_SHOWN + FREE_SLOTS_WIDE },
              (_, index) => (
                <Slot
                  key={`free-${index}`}
                  state="waiting"
                  className={index >= FREE_SLOTS_SHOWN ? "hidden sm:flex" : ""}
                >
                  <span className="slot-label text-ink-faint">
                    Slot {String(leagues.length + index + 1).padStart(2, "0")}
                  </span>
                </Slot>
              ),
            )}
          </Slots>
        </Bank>

        <LeagueForms />
      </Sheet>
    </>
  );
}
