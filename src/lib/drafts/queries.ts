import "server-only";

import { getSession } from "@/lib/auth/session";
import {
  buildRadar,
  countByPosition,
  whoIsOnClock,
  type EnginePick,
  type Position,
  type RadarRow,
  radarSize,
} from "@/lib/engine";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import type { PoolPlayer } from "@/lib/pool/search";
import { createUserClient } from "@/lib/pb/server";

import { DRAFTABLE_PLAYERS_FILTER } from "./pipeline";

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
   * The `overall_no` the board marks in the commissioner's marker: whoever is
   * on the clock, or — while paused — the slot the draft stands at. Null on a
   * finished board. Distinct from `onClock`, which is null throughout a pause
   * because that is what pausing means.
   */
  markedOverallNo: number | null;
  /**
   * The viewer's own membership, or null for a commissioner who has no row yet.
   *
   * `autodraftEnabled` is theirs to change from the room — the sweep reads it
   * one tick later and takes their turn as soon as it comes round. Everyone
   * else's flag is Phase 3.6's console.
   */
  you: { memberId: string; autodraftEnabled: boolean } | null;
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
  /**
   * The same count for **whoever is on the clock**, which is not always the
   * viewer: a commissioner entering a pick for a dead phone needs that member's
   * legality, not their own. The pool mutes rows against this. Null while
   * nobody is on the clock, which mutes nothing.
   */
  clockNeeds: Record<Position, number> | null;
  /**
   * The whole draftable pool, drafted players included and marked as such.
   *
   * Not just the available ones, because "hide drafted" is a filter and a
   * filter needs something to filter — and its off state answers a question a
   * draft room asks out loud: has somebody already taken Nunn, and who? 324
   * rows is small enough to send once and narrow in the browser, which is what
   * makes 3.3's search instant and free of round trips.
   */
  pool: PoolPlayer[];
  /** How many of `pool` nobody holds yet. The Bank's count. */
  availableCount: number;
  /**
   * The roster radar — slice 3.2. One row per member, **in draft order**, so it
   * reads down the same order the board reads across and the two can be zipped
   * against one `columns` array.
   */
  radar: RadarRow[];
  /**
   * Slots per roster, from `leagues.settings.roster_template` — the room's
   * "3 of 13". Read here rather than recomputed in the page, because the
   * template is a league setting and the blueprint leaves open whether a
   * twelve-member league drops to eleven-man rosters.
   */
  rosterTotal: number;
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
    autodraft_enabled?: boolean;
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

  const state = {
    format: draft.format,
    memberIds: draft.order,
    rounds: draft.rounds,
    currentPick: draft.current_pick,
    status: draft.status,
  };
  const clock = whoIsOnClock(state, enginePicks);

  /**
   * The slot the board marks — which is not the same question as who is on the
   * clock, because a paused draft deliberately has nobody on it and yet still
   * stands somewhere.
   *
   * Asked of the engine, with the status it would have if it were running,
   * rather than read off `current_pick`: in §3's repairable state `current_pick`
   * points at a number that *already has a pick*, and `whoIsOnClock` is the
   * function that exists to correct exactly that. Reading the field raw would
   * put the marker on a filled slot — and, because a filled slot wins, would
   * leave a paused board with no marker at all while the banner above it is
   * still struck in marker. Returns null for a finished board, which has no
   * next slot.
   */
  const marked =
    clock ??
    (draft.status === "paused"
      ? whoIsOnClock({ ...state, status: "live" }, enginePicks)
      : null);

  const rosterOf = (memberId: string | undefined) =>
    picks
      .filter((pick) => pick.memberId === memberId)
      .map((pick) => ({ position: pick.position }));

  /** Who holds each player, by player id — the pool's `takenBy`. */
  const heldBy = new Map(
    picks.map((pick) => [
      pick.playerId,
      { by: pick.memberName, at: pick.overallNo },
    ]),
  );

  // The whole pool, drafted players included — see `pool` on DraftView. 324
  // players is small enough to read whole and to send whole.
  const players = await pb.collection("players").getFullList<{
    id: string;
    name: string;
    name_normalized: string;
    club_code: string;
    position: Position;
    status: string;
  }>({
    filter: DRAFTABLE_PLAYERS_FILTER,
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
    markedOverallNo: marked?.overallNo ?? null,
    you: you
      ? {
          memberId: you.id,
          autodraftEnabled: Boolean(you.autodraft_enabled),
        }
      : null,
    canManage:
      league.commissioner === session.user.id || Boolean(you?.can_manage),
    members: memberRecords.map((record) => ({
      id: record.id,
      name: nameOf.get(record.id) ?? "Unknown member",
      isYou: record.id === youId,
    })),
    yourNeeds: needsOf(rosterOf(youId), settings.roster_template),
    clockNeeds: clock
      ? needsOf(rosterOf(clock.memberId), settings.roster_template)
      : null,
    pool: players.map((player) => {
      const held = heldBy.get(player.id);
      return {
        id: player.id,
        name: player.name,
        // The ingestion match key, carried so the browser can match
        // "valanciunas" against "Valančiūnas" without owning a second folding
        // implementation. Never displayed — ingestion sorts its tokens.
        normalized: player.name_normalized ?? "",
        club: player.club_code,
        position: player.position,
        status: player.status,
        takenBy: held?.by ?? null,
        takenAt: held?.at ?? null,
      };
    }),
    availableCount: players.filter((player) => !heldBy.has(player.id)).length,
    radar: buildRadar(
      // Draft order, not the order PocketBase returned the memberships in.
      draft.order.map((memberId) => ({
        memberId,
        picks: picks
          .filter((pick) => pick.memberId === memberId)
          .map((pick) => ({
            overallNo: pick.overallNo,
            playerId: pick.playerId,
            position: pick.position,
          })),
      })),
      settings.roster_template,
    ),
    rosterTotal: radarSize(settings.roster_template),
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
