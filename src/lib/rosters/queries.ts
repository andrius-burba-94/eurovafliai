import "server-only";

import { getSession } from "@/lib/auth/session";
import { createUserClient } from "@/lib/pb/server";

import type { PlayerSource, PlayerStatus, RosterAuthority } from "./types";
import type { Position } from "@/lib/engine";

/**
 * Reading the pool, as the signed-in member.
 *
 * Reads go through the user's token so PocketBase's API rules apply — the
 * pool's `listRule` is `@request.auth.id != ""`, and that is defense-in-depth
 * rather than decoration (ADR-0002). Writes are the ingestion pipeline's, and
 * they use the superuser client.
 */

export type PoolPlayer = {
  id: string;
  name: string;
  club_code: string;
  club_name: string;
  position: Position;
  status: PlayerStatus;
  person_code: string;
  source: PlayerSource;
  manual_lock: boolean;
  dorsal: string;
};

export type Pool = {
  players: PoolPlayer[];
  clubs: { code: string; name: string; players: PoolPlayer[] }[];
  counts: {
    total: number;
    byPosition: Record<Position, number>;
    bySource: Record<string, number>;
    left: number;
    locked: number;
    withoutPersonCode: number;
  };
  authority: RosterAuthority;
  lastImport: {
    id: string;
    source: string;
    season: string;
    applied: boolean;
    rows: number;
    created: string;
  } | null;
};

/**
 * The whole pool, grouped by club.
 *
 * 324 rows, so this reads everything and groups in memory rather than paging:
 * filters, search and the "hide drafted" default are Phase 3.3's job, and
 * inventing half of them here would mean building them twice.
 */
export async function getPool(): Promise<Pool | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);

  const players = await pb.collection("players").getFullList<PoolPlayer>({
    // Club, then name: the order a roster is actually read in.
    sort: "club_code,name",
    requestKey: null,
  });

  const settings = await pb
    .collection("app_settings")
    .getFullList<{ roster_authority: RosterAuthority }>({ requestKey: null });

  const imports = await pb
    .collection("roster_imports")
    .getList<Pool["lastImport"] & object>(1, 1, {
      sort: "-created",
      requestKey: null,
    });

  const byPosition: Record<Position, number> = { G: 0, F: 0, C: 0 };
  const bySource: Record<string, number> = {};
  const clubs = new Map<
    string,
    { code: string; name: string; players: PoolPlayer[] }
  >();
  let left = 0;
  let locked = 0;
  let withoutPersonCode = 0;

  for (const player of players) {
    byPosition[player.position] += 1;
    bySource[player.source] = (bySource[player.source] ?? 0) + 1;
    if (player.status === "left") left += 1;
    if (player.manual_lock) locked += 1;
    if (!player.person_code) withoutPersonCode += 1;

    const club = clubs.get(player.club_code) ?? {
      code: player.club_code,
      name: player.club_name,
      players: [],
    };
    club.players.push(player);
    clubs.set(player.club_code, club);
  }

  return {
    players,
    clubs: [...clubs.values()],
    counts: {
      total: players.length,
      byPosition,
      bySource,
      left,
      locked,
      withoutPersonCode,
    },
    authority: settings[0]?.roster_authority ?? "api",
    lastImport: imports.items[0] ?? null,
  };
}
