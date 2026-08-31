import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Bank,
  CardName,
  Correction,
  Field,
  Sheet,
  Slot,
  Slots,
  TopRail,
  inputStyles,
} from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { logout } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { createLeague, joinLeague } from "@/lib/leagues/actions";
import { listMyLeagues } from "@/lib/leagues/queries";

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

export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const leagues = await listMyLeagues();
  const { error, code } = await searchParams;
  // The league actions send finished sentences rather than codes (see
  // `fail()` in src/lib/leagues/actions.ts), so this renders the server's own
  // words. It is capped because the value arrives in a URL: a crafted link
  // should not be able to put a paragraph of someone else's text in an alert.
  const message =
    typeof error === "string" && error.trim()
      ? error.trim().slice(0, 160)
      : undefined;
  const prefilledCode = typeof code === "string" ? code : "";

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
        {message ? (
          <Correction testId="home-error">{message}</Correction>
        ) : null}

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

        <div className="grid gap-8 sm:grid-cols-2">
          <Bank label="Start a league">
            <form action={createLeague} className="flex flex-col gap-5">
              <Field label="League name">
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={60}
                  placeholder="Vafliai 2027"
                  data-testid="create-league-name"
                  className={inputStyles}
                />
              </Field>
              {/* The primary: creating a league is the act this surface exists
                  for, so it carries the marker and joining does not. */}
              <SubmitButton
                testId="create-league"
                tone="live"
                pendingLabel="Opening the board…"
              >
                Create as commissioner
              </SubmitButton>
            </form>
          </Bank>

          <Bank label="Join a league">
            <form action={joinLeague} className="flex flex-col gap-5">
              <Field label="Invite code">
                <input
                  name="code"
                  required
                  defaultValue={prefilledCode}
                  placeholder="ABC234"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  data-testid="join-league-code"
                  className={`${inputStyles} text-lg uppercase tracking-[0.32em]`}
                />
              </Field>
              <SubmitButton testId="join-league" pendingLabel="Taking a slot…">
                Join
              </SubmitButton>
            </form>
          </Bank>
        </div>
      </Sheet>
    </>
  );
}
