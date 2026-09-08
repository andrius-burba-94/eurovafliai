import { notFound, redirect } from "next/navigation";

import { BackLink, Bank, Sheet, Slot, Slots, TopRail } from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { canManageRosters } from "@/lib/rosters/actions";
import { readStatsOverview } from "@/lib/stats/actions";

import { StatImportForm } from "./import-form";

/**
 * Import a round's box scores — slice 4.1.
 *
 * The manual path, and it stays the manual path after 4.3 automates it: the
 * fetcher can be down, the feed can change shape, and a box score can be
 * amended after the fact. Both doors write through the same `store.ts`, so a
 * hand-imported round and a fetched one are the same rows.
 *
 * Gated exactly like `/players/import`, and `notFound()` rather than a refusal
 * for the same reason — the page does not confirm it exists to somebody with no
 * business here.
 */
export default async function StatImportPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  if (!(await canManageRosters())) notFound();

  const overview = await readStatsOverview();

  const roundsSaid =
    overview.rounds.length === 0
      ? "No games stored yet"
      : overview.rounds.length === 1
        ? `Round ${overview.rounds[0]}`
        : `Rounds ${overview.rounds[0]}–${overview.rounds[overview.rounds.length - 1]}`;

  return (
    <>
      <TopRail action={<BackLink href="/players">The pool</BackLink>} />
      <Sheet testId="stat-import">
        <div className="flex max-w-xl flex-col gap-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Import box scores
          </h1>
          <p className="text-ink-soft">
            Paste a round&apos;s player lines, read what it would store, then
            apply it. Nothing is written until you say so, and importing the
            same sheet twice stores it once.
          </p>
        </div>

        <Bank label={`Stored for ${overview.season}`} aside={roundsSaid}>
          <Slots testId="stats-stored">
            <Slot state={overview.rows > 0 ? "filled" : "waiting"}>
              <span className="slot-label">Game lines</span>
              <span className="text-sm tabular-nums">{overview.rows}</span>
            </Slot>
            <Slot state={overview.rounds.length > 0 ? "filled" : "waiting"}>
              <span className="slot-label">Rounds</span>
              <span className="text-sm tabular-nums">
                {overview.rounds.length}
              </span>
            </Slot>
          </Slots>
          {overview.batches.length > 0 ? (
            <Slots testId="stats-batches">
              {overview.batches.map((batch) => (
                <Slot key={batch.id} state={batch.applied ? "filled" : "waiting"}>
                  <span className="slot-label">
                    {batch.applied ? batch.source : `${batch.source}, not applied`}
                  </span>
                  <span className="text-sm tabular-nums">
                    {batch.createdRows} new · {batch.updatedRows} corrected
                  </span>
                </Slot>
              ))}
            </Slots>
          ) : (
            <p className="text-sm text-ink-soft">
              Nothing has been imported yet. The 2026-27 season tips off on 24
              September 2026.
            </p>
          )}
        </Bank>

        <StatImportForm season={overview.season} />
      </Sheet>
    </>
  );
}
