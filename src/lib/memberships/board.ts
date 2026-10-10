import type PocketBase from "pocketbase";

import type { Position } from "@/lib/engine";
import { leaguePosition, leagueSource } from "@/lib/positions";
import { signableIn } from "@/lib/source-positions/plan";

import type { Seat } from "./plan";
import { listActiveMemberships } from "./store";

/**
 * Who holds whom and who can be signed — framework-free, so the worker's scout
 * pass reads the same board the transaction builder and the Scout page do
 * (7.2 G). In a linked league a free agent is a player its game lists.
 */

type ExpandedPlayer = {
  id: string;
  name: string;
  club_code: string;
  club_name: string;
  position: Position;
  basketnews_position?: Position;
  fantasy_position?: Position;
  status?: string;
};

type MembershipRow = {
  id: string;
  player: string;
  member: string;
  expand?: { player?: ExpandedPlayer };
};

export type BoardSeat = Seat & {
  readonly name: string;
  readonly clubName: string;
  readonly clubCode: string;
  readonly status: string;
};

export type FreeAgent = {
  readonly id: string;
  readonly name: string;
  readonly clubName: string;
  readonly clubCode: string;
  readonly position: Position;
  readonly normalized: string;
  /** The pool's availability word: `active`, `injured`, `doubtful`. */
  readonly status: string;
};

type PoolRow = {
  id: string;
  name: string;
  name_normalized?: string;
  club_code: string;
  club_name: string;
  position: Position;
  basketnews_position?: Position;
  fantasy_position?: Position;
  basketnews_listed?: boolean;
  fantasy_listed?: boolean;
  status: string;
};

/** Active seats plus unsigned players, read with whatever client the caller holds. */
export async function readBoard(
  pb: PocketBase,
  leagueId: string,
): Promise<{ seats: BoardSeat[]; freeAgents: FreeAgent[] }> {
  const [league, memberships, pool] = await Promise.all([
    pb.collection("leagues").getOne<{ basketnews_team_id?: string; fantasy_league_id?: string }>(leagueId, {
      fields: "basketnews_team_id,fantasy_league_id",
      requestKey: null,
    }),
    listActiveMemberships<MembershipRow>(pb, leagueId, { expand: "player" }),
    pb.collection("players").getFullList<PoolRow>({
      filter: "status != 'left'",
      fields: "id,name,name_normalized,club_code,club_name,position,basketnews_position,fantasy_position,basketnews_listed,fantasy_listed,status",
      requestKey: null,
    }),
  ]);
  const source = leagueSource(league);

  const seats: BoardSeat[] = memberships.flatMap((row) => {
    const player = row.expand?.player;
    if (!player) return [];
    return [
      {
        id: row.id,
        member: row.member,
        player: player.id,
        position: leaguePosition(player, source),
        name: player.name,
        clubName: player.club_name,
        clubCode: player.club_code,
        status: player.status ?? "active",
      },
    ];
  });
  const owned = new Set(seats.map((seat) => seat.player));
  const freeAgents = signableIn(pool, source)
    .filter((player) => !owned.has(player.id))
    .map((player) => ({
      id: player.id,
      name: player.name,
      clubName: player.club_name,
      clubCode: player.club_code,
      position: leaguePosition(player, source),
      normalized: player.name_normalized ?? player.name,
      status: player.status,
    }));

  return { seats, freeAgents };
}
