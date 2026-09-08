import { notFound, redirect } from "next/navigation";

import { BackLink, Sheet, TopRail } from "@/components/board";
import { getSession } from "@/lib/auth/session";
import { readLatestCheck, readUnmatchedCodes } from "@/lib/mapping/queries";
import { canManageRosters } from "@/lib/rosters/actions";

import { MappingSurface } from "./mapping-surface";

/**
 * Player mapping — slice 4.2.
 *
 * Two questions about identity, asked from opposite directions:
 *
 * - the feed has re-registered a stored player under a different name, so a
 *   sync would split one human into a departure and a duplicate;
 * - a box score names a person code the pool has never heard of, so those
 *   points have nowhere to land.
 *
 * The blueprint calls this "a light verification pass", which it was expected
 * to be — 2.1 syncs `person_code` on day one, so joins are exact by id. What
 * made it more than that is what the clubs actually did: they registered their
 * codeless signings under **passport names**, so on 2026-09-08 a sync would
 * have planned 18 adds and 22 departures against the real pool, at least 15 of
 * those pairs being the same person.
 *
 * The page opens with **the last check**, not with a fresh one. Asking the feed
 * is 21 requests and a few seconds, so it happens when somebody presses the
 * button — and the answer is stored as a report-only `roster_imports` batch, so
 * coming back to finish the list does not cost another 21. Staleness is handled
 * where it must be anyway: every confirm re-validates against live player rows.
 */
export default async function MappingPage({
  searchParams,
}: PageProps<"/players/mapping">) {
  const session = await getSession();
  if (!session) redirect("/login?error=unauthorized");
  if (!(await canManageRosters())) notFound();

  // `?check=<batch id>` opens one particular stored check rather than the
  // newest. A check is an audit record, so being able to return to a specific
  // one by link is worth having on its own — and "the newest" is app-global,
  // which is a property tests cannot work around.
  const { check } = await searchParams;
  const [unmatched, lastCheck] = await Promise.all([
    readUnmatchedCodes(),
    readLatestCheck(typeof check === "string" ? check : undefined),
  ]);

  return (
    <>
      <TopRail action={<BackLink href="/players">The pool</BackLink>} />
      <Sheet testId="player-mapping">
        <div className="flex max-w-xl flex-col gap-3">
          <h1 className="text-3xl font-semibold uppercase tracking-[0.04em] sm:text-4xl">
            Player mapping
          </h1>
          <p className="text-ink-soft">
            Two things end up here: a player the feed now calls something else,
            and a person code from a box score that matches nobody. Both are
            questions about whether two records are one person, and neither is
            answered without you.
          </p>
        </div>

        <MappingSurface unmatched={unmatched} lastCheck={lastCheck} />
      </Sheet>
    </>
  );
}
