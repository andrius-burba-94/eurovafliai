import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Bank,
  CardBlock,
  CardBlocks,
  PositionPatch,
} from "@/components/board";
import { StatusBadge } from "@/components/broadcast";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth/session";
import { listMyLeagues } from "@/lib/leagues/queries";

import { LeagueForms } from "./league-forms";
import { leagueHref } from "@/lib/nav/urls";

/**
 * Your leagues: the signed-in home. Create one as commissioner, or join a
 * friend's with its invite code.
 *
 * Almost everyone is in exactly one league, so each league is one big card
 * whose button is the thing a member most likely came to do right now: the
 * lobby, the draft room, this round's lineup, or the final table. The two
 * forms below are how another league starts.
 */

/** What a member most likely came to do, by where the league stands. */
const NEXT = {
  setup: { status: "Lobby", kind: "scheduled", action: "Go to the lobby", path: "" },
  drafting: { status: "Drafting", kind: "live", action: "Enter the draft room", path: "/draft" },
  season: { status: "In season", kind: "provisional", action: "Set your lineup", path: "/lineup" },
  complete: { status: "Final", kind: "final", action: "See the final table", path: "/standings" },
} as const;

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const leagues = await listMyLeagues();

  return (
    <AppShell current="leagues" testId="app-shell">
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="display text-4xl sm:text-5xl">
          Your leagues
        </h1>
        <p className="text-ink-soft">
          Open the board for draft night, or check where the season stands.
        </p>
      </div>

      {leagues.length === 0 ? (
        <Bank label="Open a league" framed aside="none yet">
          <CardBlocks testId="leagues-list" label="Your leagues">
            <CardBlock state="waiting">
              <span
                data-testid="leagues-empty"
                className="min-w-0 text-sm break-words text-ink-soft"
              >
                No leagues yet. A league is the board you draft on and the
                table you keep score on. Start one below, or join a
                friend&rsquo;s with their invite code.
              </span>
            </CardBlock>
          </CardBlocks>
        </Bank>
      ) : (
        <ul data-testid="leagues-list" aria-label="Your leagues" className="flex flex-col gap-4">
          {leagues.map((league) => {
            const next = NEXT[league.status];
            return (
              <li
                key={league.id}
                data-state={league.status === "setup" ? "waiting" : "filled"}
                className="relative isolate overflow-hidden rounded-card border border-panel-border bg-stock-panel"
              >
                <span aria-hidden="true" className="lattice pointer-events-none absolute inset-0 -z-10" />
                <div className="flex flex-col gap-5 p-5 sm:p-6">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-col gap-1">
                      <span className="slot-label text-ink-soft">
                        EuroLeague {league.season}
                      </span>
                      <Link
                        href={leagueHref(league)}
                        className="display text-4xl break-words hover:text-live focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live sm:text-5xl"
                      >
                        {league.name}
                      </Link>
                    </div>
                    <StatusBadge kind={next.kind}>{next.status}</StatusBadge>
                  </div>

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

                  <Link
                    href={`${leagueHref(league)}${next.path}`}
                    className="inline-flex min-h-11 w-fit items-center gap-2 rounded-lg border border-live bg-live px-5 text-sm font-bold text-live-ink transition-colors hover:brightness-110 active:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
                  >
                    {next.action} <span aria-hidden="true">&rarr;</span>
                  </Link>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <LeagueForms hasLeagues={leagues.length > 0} />
    </AppShell>
  );
}
