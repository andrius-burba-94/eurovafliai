import "server-only";

import { getSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { readStoredFixtures } from "@/lib/fixtures/store";
import { createUserClient } from "@/lib/pb/server";

import { readSyncRuns, type SyncRun } from "./store";
import { APPLY_AFTER_LOCK_MS, roundWindows, syncModeAt, type RoundWindow, type SyncDecision } from "./windows";

export type FantasySyncView = {
  readonly runs: readonly SyncRun[];
  readonly decision: SyncDecision;
  /** The window the decision is about: the one frozen now, or the next to freeze. */
  readonly window: RoundWindow | null;
  readonly firstApplyAt: number | null;
  readonly tokenSet: boolean;
  readonly suggestedLeagueId: string;
};

/** Everything the sync page shows, read with the viewer's token. */
export async function readFantasySyncView(leagueId: string): Promise<FantasySyncView | null> {
  const session = await getSession();
  if (!session) return null;
  const pb = createUserClient(session.token);
  const config = serverConfig();
  const [runs, fixtures] = await Promise.all([
    readSyncRuns(pb, leagueId, 8),
    readStoredFixtures(pb, config.EUROLEAGUE_SEASON),
  ]);
  const windows = roundWindows(fixtures.map((row) => ({ round: row.round, utcDate: row.utc_date || null })));
  const now = Date.now();
  const decision = syncModeAt(now, windows);
  const window = decision.round === null ? null : (windows.find((row) => row.round === decision.round) ?? null);
  return {
    runs,
    decision,
    window,
    firstApplyAt: window ? window.lockAt + APPLY_AFTER_LOCK_MS : null,
    tokenSet: Boolean(config.FANTASY_CHALLENGE_TOKEN),
    suggestedLeagueId: config.FANTASY_CHALLENGE_LEAGUE_ID ?? "",
  };
}
