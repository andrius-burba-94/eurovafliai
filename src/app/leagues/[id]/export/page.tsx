import { notFound, redirect } from "next/navigation";

import {
  Bank,
  EmptyNotice,
  Field,
  selectStyles,
} from "@/components/board";
import { AppShell } from "@/components/app-shell";
import { SubmitButton } from "@/components/submit-button";
import { getSession } from "@/lib/auth/session";
import { hasDraft } from "@/lib/exports/queries";
import {
  EXPORT_DESCRIPTION,
  EXPORT_KINDS,
  EXPORT_LABEL,
} from "@/lib/exports/tables";
import { getLeagueWithMembers } from "@/lib/leagues/queries";
import { navLeagueFrom } from "@/lib/nav/items";

/**
 * Take the draft away with you.
 *
 * Any member, not just the commissioner: the board is already readable by
 * everyone in the league, so a file of what it says is not a new permission —
 * and making one person the source of a spreadsheet everybody wants is how a
 * commissioner becomes a bottleneck for a league of ten friends.
 *
 * A plain `method="get"` form, so this surface needs no JavaScript at all: the
 * checkboxes become query parameters and the handler one segment down answers
 * with a file. That also makes the result a URL somebody can paste into the
 * league chat, which is where this file is actually going.
 */
export default async function ExportPage({
  params,
}: PageProps<"/leagues/[id]/export">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");

  const { id } = await params;
  const data = await getLeagueWithMembers(id);
  if (!data) notFound();

  // Not a member is the same answer as no such league, as everywhere else.
  if (!data.members.some((member) => member.isYou)) notFound();

  const { league } = data;
  const drafted = await hasDraft(id);

  return (
    <AppShell current="export" league={navLeagueFrom(data)} testId="export">
      <div className="flex flex-col gap-4">
        <span className="slot-label text-ink">{league.name}</span>
        <h1 className="text-3xl font-semibold tracking-[0.04em] uppercase sm:text-4xl">
          Export the draft
        </h1>
      </div>

      {drafted ? (
        <form
          method="get"
          action={`/leagues/${league.id}/export/download`}
          className="flex flex-col gap-6"
          data-testid="export-form"
        >
          <Bank label="What to include" framed>
            <ul role="list" className="flex flex-col gap-3">
              {EXPORT_KINDS.map((kind) => (
                <li key={kind}>
                  {/* The app's checkbox idiom, from the reshuffle
                      confirmation: a native input at `accent-live`, label
                      beside it, the whole thing one tap target. */}
                  <label className="flex items-start gap-2.5 text-sm">
                    <input
                      type="checkbox"
                      name="include"
                      value={kind}
                      defaultChecked
                      data-testid={`export-include-${kind}`}
                      className="mt-0.5 size-4 shrink-0 accent-live"
                    />
                    <span className="min-w-0">
                      <span className="block text-ink">
                        {EXPORT_LABEL[kind]}
                      </span>
                      <span className="block text-ink-soft">
                        {EXPORT_DESCRIPTION[kind]}
                      </span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </Bank>

          <Field label="Format">
            <select
              name="format"
              defaultValue="csv"
              data-testid="export-format"
              className={selectStyles}
            >
              <option value="csv">CSV — opens in Sheets or Excel</option>
              <option value="json">JSON — exact, keeps every field</option>
            </select>
          </Field>

          <EmptyNotice>
            One thing selected gives a plain sheet. Two or more in CSV are
            written as labelled sections in one file, because CSV has no
            second sheet — ask for JSON if something is going to parse it.
            &ldquo;Rosters as drafted&rdquo; is the draft, not today&rsquo;s
            squads: a trade moves a player without moving the pick that took
            them.
          </EmptyNotice>

          <SubmitButton testId="export-download" tone="live">
            Download
          </SubmitButton>
        </form>
      ) : (
        <Bank label="Nothing to export yet" framed>
          <EmptyNotice testId="export-empty">
            This league has not drafted yet. Once the commissioner rolls the
            order there is an order to export, and once the first pick is in
            there are results and rosters too.
          </EmptyNotice>
        </Bank>
      )}
    </AppShell>
  );
}
