import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Bank,
  Bay,
  Bays,
  BoardButton,
  CardName,
  Correction,
  Field,
  Sheet,
  TopRail,
  inputStyles,
} from "@/components/board";
import { logout } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { createLeague, joinLeague } from "@/lib/leagues/actions";
import { listMyLeagues } from "@/lib/leagues/queries";

/**
 * Your leagues: the signed-in home. Create one as commissioner, or join a
 * friend's with its invite code.
 *
 * Each league is a bay on the wall. A league still in setup is a waiting bay —
 * dashed rule — and one with its draft underway is struck in marker. The two
 * forms are bays too, so the primary action is never a floating card.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const leagues = await listMyLeagues();
  const { error, code } = await searchParams;
  const message = typeof error === "string" ? error : undefined;
  const prefilledCode = typeof code === "string" ? code : "";

  return (
    <>
      <TopRail
        action={
          <form action={logout}>
            <button
              type="submit"
              data-testid="logout"
              className="slot-label transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
            >
              Sign out &middot; {session.user.name || session.user.email}
            </button>
          </form>
        }
      />
      <Sheet testId="app-shell">
        {message ? <Correction testId="home-error">{message}</Correction> : null}

        <Bank
          label="Your leagues"
          aside={leagues.length > 0 ? `${leagues.length} on the wall` : undefined}
        >
          {leagues.length === 0 ? (
            <div className="bay-waiting px-3 py-5">
              <p data-testid="leagues-empty" className="text-sm text-ink-soft">
                No bays taken yet. Start a league below, or join a
                friend&rsquo;s with their invite code.
              </p>
            </div>
          ) : (
            <Bays testId="leagues-list">
              {leagues.map((league) => (
                <Bay
                  key={league.id}
                  state={league.status === "setup" ? "waiting" : "live"}
                >
                  <Link
                    href={`/leagues/${league.id}`}
                    className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                  >
                    <CardName>{league.name}</CardName>
                    <span className="slot-label">
                      {league.season} &middot; {league.status}
                    </span>
                  </Link>
                </Bay>
              ))}
            </Bays>
          )}
        </Bank>

        <div className="grid gap-bay sm:grid-cols-2 sm:gap-8">
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
              <BoardButton testId="create-league">
                Create as commissioner
              </BoardButton>
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
              <BoardButton testId="join-league">Join</BoardButton>
            </form>
          </Bank>
        </div>
      </Sheet>
    </>
  );
}
