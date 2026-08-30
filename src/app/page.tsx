import { redirect } from "next/navigation";

import { logout } from "@/lib/auth/actions";
import { getSession } from "@/lib/auth/session";

/**
 * Signed-in home. Placeholder content: the league list and lobby arrive in
 * Phase 1.3, the app shell and design tokens in 1.4. What is real here is the
 * session — this page proves the whole auth round-trip worked.
 *
 * `src/proxy.ts` already turns anonymous traffic away, but this check is the
 * authoritative one: the proxy only sees whether a cookie exists.
 */
export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  return (
    <main
      data-testid="app-shell"
      className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center gap-8 px-6 py-16"
    >
      <div className="flex flex-col gap-2">
        <p className="font-mono text-xs uppercase tracking-[0.2em] opacity-60">
          Euroleague 2026&ndash;27
        </p>
        <h1 className="text-4xl font-semibold tracking-tight">Eurovafliai</h1>
        <p className="text-lg opacity-70">
          Signed in as{" "}
          <span data-testid="session-name" className="font-medium opacity-100">
            {session.user.name || session.user.email}
          </span>
          .
        </p>
      </div>

      <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 font-mono text-sm">
        <dt className="opacity-60">Next</dt>
        <dd>localhost:3007</dd>
        <dt className="opacity-60">PocketBase</dt>
        <dd>127.0.0.1:8095</dd>
        <dt className="opacity-60">Roster</dt>
        <dd>13 players &middot; 5G / 5F / 3C</dd>
        <dt className="opacity-60">Next up</dt>
        <dd>Phase 1.3 &mdash; leagues and the lobby</dd>
      </dl>

      <form action={logout}>
        <button
          type="submit"
          data-testid="logout"
          className="border border-current/25 px-4 py-2 text-sm transition-opacity hover:opacity-70 focus-visible:outline-2 focus-visible:outline-offset-2"
        >
          Sign out
        </button>
      </form>
    </main>
  );
}
