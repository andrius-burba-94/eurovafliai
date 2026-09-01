import "server-only";

import { createUserClient } from "@/lib/pb/server";
import { getSession } from "@/lib/auth/session";
import { memberListQuery, toMember } from "./lobby";
import { reconcileLeagueStatus } from "@/lib/drafts/repair";

import { ensureCommissionerMembership } from "./repair";
import { parseLeagueSettings } from "./settings";
import type { LeagueRecord, LeagueWithMembers, MemberRecord } from "./types";

/**
 * Reads, performed with the *user's* token so PocketBase's read rules apply.
 *
 * That is the point: if a rule were wrong, these queries would return nothing
 * rather than another league's data. Writes are the superuser's job
 * (`./actions.ts`); nothing here writes.
 */

/** Every league the signed-in user can see: ones they joined, or commission. */
export async function listMyLeagues(): Promise<LeagueRecord[]> {
  const session = await getSession();
  if (!session) return [];

  const pb = createUserClient(session.token);
  // No filter needed — the collection's list rule already scopes this to
  // leagues the user commissions or is a member of.
  return pb.collection("leagues").getFullList<LeagueRecord>({
    sort: "-created",
    requestKey: null,
  });
}

/**
 * One league with its members, or null when the viewer may not see it.
 *
 * Null covers both "no such league" and "not yours" on purpose: distinguishing
 * them would let anyone probe which invite codes exist.
 */
export async function getLeagueWithMembers(
  leagueId: string,
): Promise<LeagueWithMembers | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);

  let league: LeagueRecord;
  try {
    league = await pb.collection("leagues").getOne<LeagueRecord>(leagueId, {
      requestKey: null,
    });
  } catch {
    return null;
  }

  // Repair before reading the members, not after.
  //
  // `createLeague` writes twice and PocketBase has no transactions, so a league
  // can exist whose commissioner has no membership row. The obvious shape —
  // read members, notice the gap, repair, read again — does not work: Next
  // memoizes identical GET fetches within a single render pass, so the second
  // read returns the first read's stale result and the repair looks like it
  // failed. Repairing first means one member read, always fresh.
  //
  // The call is idempotent and cheap (one indexed lookup), so it runs whenever
  // the viewer is the commissioner rather than only when a gap is suspected.
  if (league.commissioner === session.user.id) {
    await ensureCommissionerMembership(leagueId);
  }

  // The other lost-second-write on this page: a draft that finished (or was
  // undone) without the league's own status following it. Same rule — repair
  // before the read, never after.
  await reconcileLeagueStatus(leagueId, league.status);

  const members = await pb
    .collection("league_members")
    .getFullList<MemberRecord>(memberListQuery(leagueId));

  const context = {
    commissionerUserId: league.commissioner,
    viewerUserId: session.user.id,
  };

  return {
    league,
    settings: parseLeagueSettings(league.settings),
    members: members.map((m) => toMember(m, context)),
    isCommissioner: league.commissioner === session.user.id,
  };
}
