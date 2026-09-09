import "server-only";

import { getSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { createUserClient } from "@/lib/pb/server";

import type { Seat } from "./plan";
import { listActiveMemberships } from "./store";

type ExpandedPlayer = {
  id: string;
  name: string;
  club_code: string;
  club_name: string;
  position: Position;
};

type MembershipRow = {
  id: string;
  player: string;
  member: string;
  to_date?: string | null;
  expand?: { player?: ExpandedPlayer };
};

type PickRef = { player: string; overall_no: number };

/**
 * One member's current roster, with the viewer's token so the collection's
 * read rule is what scopes it.
 */
export type RosterPlayer = {
  readonly id: string;
  readonly name: string;
  readonly clubCode: string;
  readonly clubName: string;
  readonly position: Position;
  readonly overallNo: number | null;
};

export async function readMemberRoster(
  leagueId: string,
  memberId: string,
): Promise<RosterPlayer[]> {
  const session = await getSession();
  if (!session) return [];

  const pb = createUserClient(session.token);
  const [memberships, drafts] = await Promise.all([
    listActiveMemberships<MembershipRow>(pb, leagueId, { expand: "player" }),
    pb.collection("drafts").getFullList<{ id: string }>({
      filter: `league = '${leagueId}' && status = 'complete'`,
      sort: "-id",
      fields: "id",
      requestKey: null,
    }),
  ]);

  const mine = memberships.filter((row) => row.member === memberId);
  const draftId = drafts[0]?.id;
  const picks = draftId
    ? await pb.collection("picks").getFullList<PickRef>({
        filter: `draft = '${draftId}'`,
        fields: "player,overall_no",
        requestKey: null,
      })
    : [];
  const overallByPlayer = new Map(
    picks.map((pick) => [pick.player, pick.overall_no]),
  );

  return mine.flatMap((row) => {
    const player = row.expand?.player;
    if (!player) return [];
    return [
      {
        id: player.id,
        name: player.name,
        clubCode: player.club_code,
        clubName: player.club_name,
        position: player.position,
        overallNo: overallByPlayer.get(player.id) ?? null,
      },
    ];
  });
}

export type BoardSeat = Seat & {
  readonly name: string;
  readonly clubName: string;
};

export type FreeAgent = {
  readonly id: string;
  readonly name: string;
  readonly clubName: string;
  readonly clubCode: string;
  readonly position: Position;
  readonly normalized: string;
};

type PoolRow = {
  id: string;
  name: string;
  name_normalized?: string;
  club_code: string;
  club_name: string;
  position: Position;
  status: string;
};

/**
 * Active seats plus unsigned players — what the transaction builder needs.
 */
export async function readTransactionBoard(leagueId: string): Promise<{
  seats: BoardSeat[];
  freeAgents: FreeAgent[];
} | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);
  const [memberships, pool] = await Promise.all([
    listActiveMemberships<MembershipRow>(pb, leagueId, { expand: "player" }),
    pb.collection("players").getFullList<PoolRow>({
      filter: "status != 'left'",
      fields: "id,name,name_normalized,club_code,club_name,position,status",
      requestKey: null,
    }),
  ]);

  const seats: BoardSeat[] = memberships.flatMap((row) => {
    const player = row.expand?.player;
    if (!player) return [];
    return [
      {
        id: row.id,
        member: row.member,
        player: player.id,
        position: player.position,
        name: player.name,
        clubName: player.club_name,
      },
    ];
  });
  const owned = new Set(seats.map((seat) => seat.player));
  const freeAgents = pool
    .filter((player) => !owned.has(player.id))
    .map((player) => ({
      id: player.id,
      name: player.name,
      clubName: player.club_name,
      clubCode: player.club_code,
      position: player.position,
      normalized: player.name_normalized ?? player.name,
    }));

  return { seats, freeAgents };
}
