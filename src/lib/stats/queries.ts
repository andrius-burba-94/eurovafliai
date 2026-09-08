import "server-only";

import { getSession } from "@/lib/auth/session";
import { createUserClient } from "@/lib/pb/server";
import type { Position } from "@/lib/engine";
import { type Phase, PHASES } from "./csv";
import type { RoundSnapshot, SnapshotRow } from "./standings";

/**
 * Reads the standings cache and a player's game log with the viewer's token,
 * so PocketBase's list rules are the thing that scopes them.
 */

function asRows(raw: unknown): SnapshotRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: SnapshotRow[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== "object") continue;
    const rec = entry as Record<string, unknown>;
    if (typeof rec.memberId !== "string") continue;
    if (typeof rec.totalTenths !== "number") continue;
    if (typeof rec.roundTenths !== "number") continue;
    rows.push({
      memberId: rec.memberId,
      totalTenths: rec.totalTenths,
      roundTenths: rec.roundTenths,
    });
  }
  return rows;
}

function asPhase(raw: unknown): Phase {
  return PHASES.includes(raw as Phase) ? (raw as Phase) : "RS";
}

export async function readStandingsSnapshots(
  leagueId: string,
  season: string,
): Promise<RoundSnapshot[]> {
  const session = await getSession();
  if (!session) return [];

  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const pb = createUserClient(session.token);
  const records = await pb
    .collection("standings_snapshots")
    .getFullList<{
      round: number;
      phase: string;
      table: unknown;
    }>({
      filter: `league = '${leagueId}' && season = "${code}"`,
      sort: "round",
      requestKey: null,
    });

  return records.map((record) => ({
    round: record.round,
    phase: asPhase(record.phase),
    table: asRows(record.table),
  }));
}

export type PlayerProfile = {
  id: string;
  name: string;
  clubCode: string;
  clubName: string;
  position: Position;
  status: string;
};

export type GameLogLine = {
  id: string;
  season: string;
  round: number;
  phase: Phase;
  clubCode: string;
  pir: number;
  fantasyTenths: number;
  gameCode: number;
};

export async function readPlayerProfile(
  playerId: string,
): Promise<{ player: PlayerProfile; log: GameLogLine[] } | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);
  try {
    const record = await pb.collection("players").getOne<{
      id: string;
      name: string;
      club_code: string;
      club_name: string;
      position: Position;
      status: string;
    }>(playerId, { requestKey: null });

    const lines = await pb.collection("player_game_stats").getFullList<{
      id: string;
      season: string;
      round: number;
      phase: string;
      club_code: string;
      pir: number;
      fantasy_pts: number;
      game_code: number;
    }>({
      filter: `player = '${playerId}'`,
      requestKey: null,
    });

    const log = [...lines]
      .sort((a, b) => {
        if (a.season !== b.season) return a.season < b.season ? -1 : 1;
        if (a.round !== b.round) return a.round - b.round;
        return a.game_code - b.game_code;
      })
      .map((row) => ({
        id: row.id,
        season: row.season,
        round: row.round,
        phase: asPhase(row.phase),
        clubCode: row.club_code,
        pir: row.pir,
        fantasyTenths: row.fantasy_pts,
        gameCode: row.game_code,
      }));

    return {
      player: {
        id: record.id,
        name: record.name,
        clubCode: record.club_code,
        clubName: record.club_name,
        position: record.position,
        status: record.status,
      },
      log,
    };
  } catch {
    return null;
  }
}
