import "server-only";

import { getSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { createUserClient } from "@/lib/pb/server";

import { listActiveMemberships } from "./store";

type ExpandedPlayer = {
  id: string;
  name: string;
  club_code: string;
  club_name: string;
  position: Position;
};

type MembershipRow = {
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
