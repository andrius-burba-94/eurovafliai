import Link from "next/link";
import { redirect } from "next/navigation";

import { logout } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";
import { createLeague, joinLeague } from "@/lib/leagues/actions";
import { listMyLeagues } from "@/lib/leagues/queries";

/**
 * Your leagues: the signed-in home. Create one as commissioner, or join a
 * friend's with its invite code.
 *
 * Design tokens and the app shell arrive in Phase 1.4; the states here are real
 * (empty, error, populated) but the styling is deliberately plain.
 */
export default async function Home({ searchParams }: PageProps<"/">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const leagues = await listMyLeagues();
  const { error, code } = await searchParams;
  const message = typeof error === "string" ? error : undefined;
  const prefilledCode = typeof code === "string" ? code : "";

  return (
    <main
      data-testid="app-shell"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-10 px-6 py-16"
    >
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">
            Euroleague 2026&ndash;27
          </p>
          <h1 className="text-3xl font-semibold tracking-tight">Eurovafliai</h1>
        </div>
        <form action={logout}>
          <button
            type="submit"
            data-testid="logout"
            className="text-sm underline decoration-current/30 underline-offset-4 transition-opacity hover:opacity-70"
          >
            Sign out, {session.user.name || session.user.email}
          </button>
        </form>
      </header>

      {message ? (
        <p
          data-testid="home-error"
          role="alert"
          className="border border-current/20 px-4 py-3 text-sm"
        >
          {message}
        </p>
      ) : null}

      <section className="flex flex-col gap-4">
        <h2 className="text-xs font-medium uppercase tracking-[0.2em] opacity-60">
          Your leagues
        </h2>
        {leagues.length === 0 ? (
          <p data-testid="leagues-empty" className="text-sm opacity-70">
            None yet. Create one below, or join a friend&rsquo;s with their
            invite code.
          </p>
        ) : (
          <ul data-testid="leagues-list" className="flex flex-col">
            {leagues.map((league) => (
              <li key={league.id} className="border-t border-current/15 py-3">
                <Link
                  href={`/leagues/${league.id}`}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 hover:opacity-70"
                >
                  <span className="font-medium">{league.name}</span>
                  <span className="font-mono text-xs uppercase tracking-wider opacity-60">
                    {league.season} &middot; {league.status}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid gap-10 sm:grid-cols-2">
        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] opacity-60">
            Start a league
          </h2>
          <form action={createLeague} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="opacity-70">League name</span>
              <input
                name="name"
                required
                minLength={2}
                maxLength={60}
                placeholder="Vafliai 2027"
                data-testid="create-league-name"
                className="border border-current/25 bg-transparent px-3 py-2"
              />
            </label>
            <button
              type="submit"
              data-testid="create-league"
              className="border border-current/25 px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
            >
              Create as commissioner
            </button>
          </form>
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-xs font-medium uppercase tracking-[0.2em] opacity-60">
            Join a league
          </h2>
          <form action={joinLeague} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="opacity-70">Invite code</span>
              <input
                name="code"
                required
                defaultValue={prefilledCode}
                placeholder="ABC234"
                autoCapitalize="characters"
                autoComplete="off"
                spellCheck={false}
                data-testid="join-league-code"
                className="border border-current/25 bg-transparent px-3 py-2 font-mono uppercase tracking-[0.2em]"
              />
            </label>
            <button
              type="submit"
              data-testid="join-league"
              className="border border-current/25 px-4 py-2 text-sm font-medium transition-opacity hover:opacity-70"
            >
              Join
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
