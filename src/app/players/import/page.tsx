import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { BackArrow, Sheet, TopRail } from "@/components/board";
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
    <>
      <TopRail
        action={
          <Link
            href="/players"
            className="slot-label inline-flex items-center gap-1.5 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
          >
            <BackArrow />
            The pool
          </Link>
        }
      />
      <Sheet testId="roster-import">
        <div className="flex max-w-xl flex-col gap-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Upload a roster
          </h1>
          <p className="text-ink-soft">
            Paste the sheet, read what it would change, then apply it. Nothing
            is written until you say so.
          </p>
        </div>

        <ImportForm authority={authority} />
      </Sheet>
    </>
  );
}
