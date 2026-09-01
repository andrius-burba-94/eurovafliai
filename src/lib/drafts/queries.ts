import "server-only";

import { getSession } from "@/lib/auth/session";
import {
  countByPosition,
  whoIsOnClock,
  type EnginePick,
  type Position,
} from "@/lib/engine";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import { createUserClient } from "@/lib/pb/server";

import { reconcileLeagueStatus } from "./repair";

import type { BoardPick, DraftRecord, PickRecord } from "./types";

/**
 * Reading the draft, as the signed-in member.
 *
 * The user's own token, so PocketBase's read rules scope it to their league —
 * the same defense-in-depth the lobby uses. Writes are the actions'.
 */

export type DraftView = {
  draft: DraftRecord;
  picks: BoardPick[];
  /** Whose turn it is, or null when the draft is finished. */
  onClock: {
    overallNo: number;
    memberId: string;
    memberName: string;
    round: number;
  } | null;
  /** True when it is the viewer's own turn. */
  isYourTurn: boolean;
  /**
   * The viewer is the commissioner or a deputy, so they may enter a pick for
   * whoever is on the clock. `makePick` has always permitted this — a phone
   * dying should not stop a draft — and this is the flag that lets the room
   * offer it rather than leaving it reachable only by a crafted request.
   */
  canManage: boolean;
  members: { id: string; name: string; isYou: boolean }[];
  /** Positions the viewer still has room for — "needs: 1 C, 2 F". */
  yourNeeds: Record<Position, number>;
  /** Players nobody has taken yet, ready to pick. */
  available: {
    id: string;
    name: string;
    club: string;
    position: Position;
  }[];
  takenPlayerIds: string[];
};

export async function getDraftView(
  leagueId: string,
): Promise<DraftView | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);

  const drafts = await pb.collection("drafts").getFullList<DraftRecord>({
    filter: `league = '${leagueId}'`,
    sort: "-created",
    requestKey: null,
  });
  const draft = drafts[0];
  if (!draft) return null;

  const league = await pb
    .collection("leagues")
    .getOne<{ settings: unknown; commissioner: string; status: string }>(
      leagueId,
      { requestKey: null },
    );
  const settings = parseLeagueSettings(league.settings);

  // Before the picks are read, not after — see the note in `repair.ts`.
  await reconcileLeagueStatus(leagueId, league.status);

  const memberRecords = await pb.collection("league_members").getFullList<{
    id: string;
    user: string;
    team_name: string;
    can_manage?: boolean;
    expand?: { user?: { name?: string; email?: string } };
  }>({
    filter: `league = '${leagueId}'`,
    expand: "user",
    requestKey: null,
  });

  const nameOf = new Map(
    memberRecords.map((record) => [
      record.id,
      record.team_name ||
        record.expand?.user?.name ||
        record.expand?.user?.email ||
        "Unknown member",
    ]),
  );
  const you = memberRecords.find((record) => record.user === session.user.id);
  const youId = you?.id;

  const pickRecords = await pb.collection("picks").getFullList<
    PickRecord & {
      expand?: {
        player?: { name?: string; club_code?: string; position?: Position };
      };
    }
  >({
    filter: `draft = '${draft.id}'`,
    sort: "overall_no",
    expand: "player",
    requestKey: null,
  });

  const picks: BoardPick[] = pickRecords.map((record) => ({
    id: record.id,
    overallNo: record.overall_no,
    round: record.round,
    slot: record.slot,
    memberId: record.member,
    memberName: nameOf.get(record.member) ?? "Unknown member",
    playerId: record.player,
    playerName: record.expand?.player?.name ?? "Unknown player",
    playerClub: record.expand?.player?.club_code ?? "",
    position: record.expand?.player?.position ?? "G",
    isAuto: Boolean(record.is_auto),
  }));

  const enginePicks: EnginePick[] = picks.map((pick) => ({
    id: pick.id,
    overallNo: pick.overallNo,
    memberId: pick.memberId,
    playerId: pick.playerId,
  }));

  const clock = whoIsOnClock(
    {
      format: draft.format,
      memberIds: draft.order,
      rounds: draft.rounds,
      currentPick: draft.current_pick,
      status: draft.status,
    },
    enginePicks,
  );

  const yourRoster = picks
    .filter((pick) => pick.memberId === youId)
    .map((pick) => ({ position: pick.position }));

  const taken = new Set(picks.map((pick) => pick.playerId));

  // The pool, minus everyone already drafted. 324 players is small enough to
  // read whole; Phase 3.3 adds the filters and the fuzzy search.
  const players = await pb.collection("players").getFullList<{
    id: string;
    name: string;
    club_code: string;
    position: Position;
    status: string;
  }>({
    filter: "status != 'left'",
    sort: "name",
    requestKey: null,
  });

  return {
    draft,
    picks,
    onClock: clock
      ? {
          overallNo: clock.overallNo,
          memberId: clock.memberId,
          memberName: nameOf.get(clock.memberId) ?? "Unknown member",
          round: clock.round,
        }
      : null,
    isYourTurn: Boolean(clock && youId && clock.memberId === youId),
    canManage:
      league.commissioner === session.user.id || Boolean(you?.can_manage),
    members: memberRecords.map((record) => ({
      id: record.id,
      name: nameOf.get(record.id) ?? "Unknown member",
      isYou: record.id === youId,
    })),
    yourNeeds: needsOf(yourRoster, settings.roster_template),
    available: players
      .filter((player) => !taken.has(player.id))
      .map((player) => ({
        id: player.id,
        name: player.name,
        club: player.club_code,
        position: player.position,
      })),
    takenPlayerIds: [...taken],
  };
}

/**
 * How many of each bucket the viewer still has room for — "needs: 1 C, 2 F".
 *
 * `openPositions` answers which buckets are open; the draft room wants the
 * count, because "needs a center" and "needs three centers" are different
 * situations in round eleven.
 */
function needsOf(
  roster: readonly { position: Position }[],
  template: { G: number; F: number; C: number },
): Record<Position, number> {
  const counts = countByPosition(roster);
  return {
    G: Math.max(template.G - counts.G, 0),
    F: Math.max(template.F - counts.F, 0),
    C: Math.max(template.C - counts.C, 0),
  };
}
