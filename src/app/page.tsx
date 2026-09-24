import Link from "next/link";
import { redirect } from "next/navigation";

import {
  Bank,
  CardBlock,
  CardBlocks,
  CardName,
  PositionPatch,
} from "@/components/board";
import { AppShell } from "@/components/app-shell";
import { getSession } from "@/lib/auth/session";
import { listMyLeagues } from "@/lib/leagues/queries";

import { LeagueForms } from "./league-forms";

/**
 * Your leagues: the signed-in home. Create one as commissioner, or join a
 * friend's with its invite code.
 *
 * A dashboard since 10.9, and the change is the layout rather than the data: a
 * league is a *subject* — a whole board with its own season, status and roster
 * fill — and nothing here is ordered or compared down a column, so a grid of
 * card blocks saying "pick one" is honest where a ruled run saying "list" was
 * not. The free slots this page used to pad itself with went with them: they
 * drew a board's shape for something that is not a board, and the two forms
 * below are how another league actually starts.
 *
 * A league still in setup is a waiting block; an established one is held.
 * Drafting remains a status word here, never the clock's marker.
 */

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const leagues = await listMyLeagues();

  return (
    <AppShell current="leagues" testId="app-shell">
      <div className="flex max-w-xl flex-col gap-3">
        <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
          Your leagues
        </h1>
        <p className="text-ink-soft">
          Open the board for draft night, or check where the season stands.
        </p>
      </div>

      <Bank
        label="Open a league"
        framed
        aside={
          leagues.length > 0
            ? `${leagues.length} league${leagues.length === 1 ? "" : "s"}`
            : "none yet"
        }
      >
        <CardBlocks testId="leagues-list" label="Your leagues" columns>
          {leagues.map((league) => (
            <CardBlock
              key={league.id}
              state={league.status === "setup" ? "waiting" : "filled"}
            >
              {/* The same negative-margin link a `Door` block uses, for the
                  same reason: the target is the whole card, not the words. */}
              <Link
                href={`/leagues/${league.id}`}
                className="-mx-3 -my-3 flex min-h-11 min-w-0 flex-1 flex-col gap-2 px-3 py-3 transition-colors hover:bg-ink/5 active:bg-ink/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-live"
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
            </CardBlock>
          ))}
          {leagues.length === 0 ? (
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
          ) : null}
        </CardBlocks>
      </Bank>

      <LeagueForms hasLeagues={leagues.length > 0} />
    </AppShell>
  );
}
