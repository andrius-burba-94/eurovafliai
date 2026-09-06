import { notFound, redirect } from "next/navigation";

import { BackLink, Sheet as Card, TopRail } from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { getCheatSheetView } from "@/lib/sheets/queries";

import { SheetForm } from "./sheet-form";
import { SheetList } from "./sheet-list";

/**
 * Your cheat sheet — slice 3.4.
 *
 * A ranked list of players, private to you, and the thing autodraft picks from
 * when your clock runs out or you hand your picks over. Editable **before and
 * during** the draft, which is why the route sits under the league rather than
 * behind the lobby's setup phase: a sheet is at its most useful in round nine,
 * when the top of it has gone and you are deciding what "best available" now
 * means.
 *
 * The blueprint asks for this as a sidebar in the draft room. It is a page
 * instead, and 3.4b's drag-to-reorder is where it earns a place inside the
 * room: this app is one column on a phone, and a 60-row list that must be
 * dragged is not something to squeeze beside a board. The room pins the part of
 * it that belongs there — best available from your sheet — and links here.
 */
export default async function CheatSheetPage({
  params,
}: PageProps<"/leagues/[id]/sheet">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const view = await getCheatSheetView(id);
  // Not a member of this league, or no such league. `notFound` rather than a
  // refusal, so the page does not confirm the league exists to somebody with
  // no business here — the same line `/players/import` draws.
  if (!view) notFound();

  return (
    <>
      <TopRail
        action={
          <BackLink
            href={view.drafting ? `/leagues/${id}/draft` : `/leagues/${id}`}
          >
            {view.drafting ? "The room" : "Lobby"}
          </BackLink>
        }
      />
      <Card testId="cheat-sheet">
        <div className="flex max-w-xl flex-col gap-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Your cheat sheet
          </h1>
          <p className="text-ink-soft">
            {view.leagueName} &middot; nobody else in the league can see this.
            Autodraft picks from it, top down, taking the first player who is
            still there and still fits your roster.
          </p>
        </div>

        <SheetList
          rows={view.rows}
          poolSize={view.poolSize}
          cover={view.cover}
        />

        <SheetForm
          leagueId={id}
          hasSheet={view.rows.length > 0}
          poolSize={view.poolSize}
          initialText={view.asText}
        />
      </Card>
    </>
  );
}
