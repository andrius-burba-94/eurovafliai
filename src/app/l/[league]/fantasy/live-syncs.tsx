"use client";

import { useLiveRefresh } from "@/lib/pb/use-live";

/**
 * Sync now only queues a job for the worker, so the run it starts would read
 * "Queued" until a reload. Each change to the league's runs re-renders the page.
 */
export function LiveSyncs({ leagueId, authToken }: { leagueId: string; authToken: string }) {
  useLiveRefresh({
    authToken,
    topics: [{ collection: "fantasy_syncs", topic: "*", filter: `league = '${leagueId}'` }],
  });
  return null;
}
