import "server-only";

import { getSuperuserClient } from "@/lib/pb/superuser";

import type { DraftRecord } from "./types";

/**
 * Idempotent repair for the second write nobody watches.
 *
 * Finishing a draft writes twice — `drafts.status = "complete"`, then
 * `leagues.status = "season"` — and undoing one writes the mirror pair. There
 * are no transactions, so either second write can be lost, and the result is a
 * league whose lobby disagrees with its own draft: the "The draft is live"
 * banner still showing over a finished board, or the banner gone from a draft
 * that is running again.
 *
 * Neither is fatal on its own, and that is exactly the problem — nothing ever
 * notices. So the draft record is treated as the truth and the league is
 * reconciled to it whenever either surface is read.
 *
 * **Returns the status that now holds**, which the caller should render instead
 * of the one it read a moment ago. Repairing and then rendering the stale value
 * is what made a half-finished reset show "the draft is live" until somebody
 * reloaded — the fix had already landed in the database and the page was
 * describing the problem it had just solved.
 *
 * Like `leagues/repair.ts`, this is deliberately NOT a `"use server"` action:
 * it runs during a render, before the read it protects, because Next memoizes
 * identical GET fetches within a render pass and a repair *after* the read
 * would be invisible until the next request.
 */
export async function reconcileLeagueStatus(
  leagueId: string,
  leagueStatus: string,
): Promise<string> {
  // A league that has never drafted has no pair to reconcile, and this runs on
  // every lobby render — so the common case costs nothing.
  if (leagueStatus !== "drafting" && leagueStatus !== "season") {
    return leagueStatus;
  }

  const pb = await getSuperuserClient();
  const drafts = await pb.collection("drafts").getFullList<DraftRecord>({
    filter: `league = '${leagueId}'`,
    sort: "-created",
    requestKey: null,
  });
  const draft = drafts[0];

  if (!draft) {
    // A league that claims to be drafting with no draft to open belongs back in
    // the lobby. This is the state `resetDraft` leaves behind if its second
    // write is lost — it deletes the draft first, on purpose, so the leftover
    // is this one rather than a "setup" league with a live draft still in it,
    // which a re-roll would then quietly draft against.
    //
    // Only from `drafting`. A `season` league with no draft record is not
    // something the app can produce, and flipping one back to the lobby would
    // throw away a finished season on the strength of a guess.
    if (leagueStatus === "drafting") {
      await pb
        .collection("leagues")
        .update(leagueId, { status: "setup" }, { requestKey: null })
        .catch(() => {});
      return "setup";
    }
    return leagueStatus;
  }

  const should = draft.status === "complete" ? "season" : "drafting";
  if (should === leagueStatus) return leagueStatus;

  await pb
    .collection("leagues")
    .update(leagueId, { status: should }, { requestKey: null })
    .catch(() => {
      // Lost a race with the write we were repairing, or with another reader
      // doing the same repair. The desired state holds either way.
    });
  return should;
}
