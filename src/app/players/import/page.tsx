import { notFound, redirect } from "next/navigation";

import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/broadcast";
import { getSession } from "@/lib/auth/session";
import { canManageRosters, readRosterAuthority } from "@/lib/rosters/actions";
import { getSuperuserClient } from "@/lib/pb/superuser";

import { ImportForm } from "./import-form";

/**
 * Upload a roster — the front door used in the 24 hours before the draft,
 * because a file cannot go down or change shape on the night.
 *
 * Gated on the league's own permission rule: the commissioner, or a member they
 * trust with it. A member who is neither gets `notFound()` rather than a
 * refusal, so the page does not confirm it exists to somebody with no business
 * here.
 */
export default async function ImportPage() {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  if (!(await canManageRosters())) notFound();

  const authority = await readRosterAuthority(await getSuperuserClient());

  return (
    <AppShell current="import-players" testId="roster-import">
      <PageHeader
        title="Upload a roster"
        lead="The official feed keeps the pool current by itself. A sheet is for correcting it: paste, review, then apply. It writes only while the CSV holds roster authority."
      />

      <ImportForm authority={authority} />
    </AppShell>
  );
}
