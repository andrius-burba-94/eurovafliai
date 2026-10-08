import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { Bank } from "@/components/board";
import { PageHeader } from "@/components/broadcast";
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

  const last = overview.batches[0];

  return (
    <AppShell current="import-stats" testId="stat-import">
      <PageHeader
        title="Import box scores"
        lead="The worker imports every finished game within 15 minutes. Paste a round here only when the feed is down or a box score was amended; the same sheet twice stores once."
      />

      <Bank label={`Stored for ${overview.season}`} aside={roundsSaid}>
        <p className="text-sm" data-testid="stats-stored">
          <span className="stat">{overview.rows}</span> game lines across{" "}
          <span className="stat">{overview.rounds.length}</span> round{overview.rounds.length === 1 ? "" : "s"}.
          {last ? (
            <span className="text-ink-soft">
              {" "}Last import {last.created.slice(0, 16).replace("T", " ")} UTC, {last.source}
              {last.applied ? "" : " (not applied)"}: {last.createdRows} new, {last.updatedRows} corrected.
            </span>
          ) : (
            <span className="text-ink-soft"> Nothing has been imported yet.</span>
          )}
        </p>
        {overview.batches.length > 1 ? (
          <details className="text-sm" data-testid="stats-batches">
            <summary className="min-h-11 cursor-pointer content-center text-ink-soft">Earlier imports</summary>
            <ul className="flex flex-col divide-y divide-panel-border">
              {overview.batches.slice(1).map((batch) => (
                <li key={batch.id} className="flex justify-between gap-4 py-1.5">
                  <span className="text-ink-soft">
                    {batch.created.slice(0, 16).replace("T", " ")} · {batch.applied ? batch.source : `${batch.source}, not applied`}
                  </span>
                  <span className="stat">{batch.createdRows} new · {batch.updatedRows} corrected</span>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </Bank>

      <StatImportForm season={overview.season} />
    </AppShell>
  );
}
