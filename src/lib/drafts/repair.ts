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
 * Like `leagues/repair.ts`, this is deliberately NOT a `"use server"` action:
 * it runs during a render, before the read it protects, because Next memoizes
 * identical GET fetches within a render pass and a repair *after* the read
 * would be invisible until the next request.
 */
export async function reconcileLeagueStatus(
  leagueId: string,
  leagueStatus: string,
): Promise<void> {
  // A league that has never drafted has no pair to reconcile, and this runs on
  // every lobby render — so the common case costs nothing.
  if (leagueStatus !== "drafting" && leagueStatus !== "season") return;

  const pb = await getSuperuserClient();
  const drafts = await pb.collection("drafts").getFullList<DraftRecord>({
    filter: `league = '${leagueId}'`,
    sort: "-created",
    requestKey: null,
  });
  const draft = drafts[0];
  if (!draft) return;

  const should = draft.status === "complete" ? "season" : "drafting";
  if (should === leagueStatus) return;

  await pb
    .collection("leagues")
    .update(leagueId, { status: should }, { requestKey: null })
    .catch(() => {
      // Lost a race with the write we were repairing, or with another reader
      // doing the same repair. The desired state holds either way.
    });
}
