import "server-only";

import { createUserClient } from "@/lib/pb/server";
import { getSession } from "@/lib/auth/session";
import { memberListQuery, toMember } from "./lobby";
import { reconcileLeagueStatus } from "@/lib/drafts/repair";

import { ensureCommissionerMembership } from "./repair";
import { parseLeagueSettings, type RosterTemplate } from "./settings";
import type { LeagueRecord, LeagueWithMembers, MemberRecord } from "./types";

type PositionCounts = Record<"G" | "F" | "C", number>;

export type LeagueCard = LeagueRecord & {
  positionCounts: PositionCounts;
  rosterTemplate: RosterTemplate;
};

const emptyPositionCounts = (): PositionCounts => ({ G: 0, F: 0, C: 0 });

function countPositions(
  rows: {
    expand?: { player?: { position?: "G" | "F" | "C" } };
  }[],
): PositionCounts {
  const counts = emptyPositionCounts();
  for (const row of rows) {
    const position = row.expand?.player?.position;
    if (position) counts[position] += 1;
  }
  return counts;
}

/**
 * Reads, performed with the *user's* token so PocketBase's read rules apply.
 *
 * That is the point: if a rule were wrong, these queries would return nothing
 * rather than another league's data. Writes are the superuser's job
 * (`./actions.ts`); nothing here writes.
 */

/** Every visible league, plus the viewer's current roster shape for its row. */
export async function listMyLeagues(): Promise<LeagueCard[]> {
  const session = await getSession();
  if (!session) return [];

  const pb = createUserClient(session.token);
  const leagues = await pb.collection("leagues").getFullList<LeagueRecord>({
    sort: "-created",
    requestKey: null,
  });

  return Promise.all(
    leagues.map(async (league) => {
      league.status = (await reconcileLeagueStatus(
        league.id,
        league.status,
      )) as LeagueRecord["status"];
      const rosterTemplate = parseLeagueSettings(
        league.settings,
      ).roster_template;

      try {
        const member = await pb
          .collection("league_members")
          .getFirstListItem<MemberRecord>(
            `league = '${league.id}' && user = '${session.user.id}'`,
            { fields: "id", requestKey: null },
          );

        if (league.status === "setup") {
          return {
            ...league,
            positionCounts: emptyPositionCounts(),
            rosterTemplate,
          };
        }

        if (league.status === "drafting") {
          const picks = await pb.collection("picks").getFullList<{
            expand?: { player?: { position?: "G" | "F" | "C" } };
          }>({
            filter: `member = '${member.id}'`,
            expand: "player",
            fields: "expand.player.position",
            requestKey: null,
          });
          return {
            ...league,
            positionCounts: countPositions(picks),
            rosterTemplate,
          };
        }

        const memberships = await pb
          .collection("roster_memberships")
          .getFullList<{
            to_round?: number | null;
            to_date?: string | null;
            expand?: { player?: { position?: "G" | "F" | "C" } };
          }>({
            filter: `league = '${league.id}' && member = '${member.id}'`,
            expand: "player",
            fields: "to_round,to_date,expand.player.position",
            requestKey: null,
          });
        return {
          ...league,
          positionCounts: countPositions(
            memberships.filter((row) => !row.to_round && !row.to_date),
          ),
          rosterTemplate,
        };
      } catch {
        return {
          ...league,
          positionCounts: emptyPositionCounts(),
          rosterTemplate,
        };
      }
    }),
  );
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
  // undone or reset) without the league's own status following it. Same rule —
  // repair before the read, never after — and render what the repair settled
  // on rather than the value read a moment before it, or the page spends one
  // whole load describing the problem it has just fixed.
  league.status = (await reconcileLeagueStatus(
    leagueId,
    league.status,
  )) as LeagueRecord["status"];

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
