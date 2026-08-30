import "server-only";

import { getSuperuserClient } from "@/lib/pb/superuser";
import type { LeagueRecord, MemberRecord } from "./types";

/**
 * Idempotent repair for `createLeague`'s two writes.
 *
 * Deliberately NOT a `"use server"` action: it is called while rendering a
 * lobby, and repair-on-read is a query-time concern rather than something a
 * client requests.
 *
 * Make sure the commissioner has a membership row in their own league. Safe to
 * call unconditionally — `unique(league, user)` means a redundant call is
 * refused by the database rather than creating a duplicate, so this never needs
 * to know whether the row is already there.
 */
export async function ensureCommissionerMembership(
  leagueId: string,
): Promise<void> {
  const pb = await getSuperuserClient();

  const league = await pb.collection("leagues").getOne<LeagueRecord>(leagueId, {
    requestKey: null,
  });

  const existing = await pb
    .collection("league_members")
    .getFullList<MemberRecord>({
      filter: `league = '${leagueId}' && user = '${league.commissioner}'`,
      requestKey: null,
    });
  if (existing.length > 0) return;

  try {
    await pb.collection("league_members").create(
      {
        league: leagueId,
        user: league.commissioner,
        team_name: "",
        autodraft_enabled: false,
      },
      { requestKey: null },
    );
  } catch {
    // Lost a race with another repair, which the unique index refused. The
    // desired state holds either way, so this is not an error.
  }
}
