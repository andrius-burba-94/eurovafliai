import type { ParsedStatRow } from "./csv";
import type { ExistingStatRow, StatPlayer } from "./plan";

/**
 * Who started, for rows stored before the field existed — slice 7.0.
 *
 * Deliberately narrower than `planStatImport`: a backfill that re-ran the
 * whole import would also rewrite any box score the feed has corrected since,
 * and moving fantasy points behind the standings' back is not a side effect a
 * starters backfill should have. This writes `started` and nothing else, and
 * only where the feed knows and the stored row disagrees, so a second run
 * writes nothing.
 */

export type StarterUpdate = { readonly id: string; readonly started: "yes" | "no" };

export function planStarterBackfill({
  rows,
  players,
  existing,
}: {
  rows: readonly ParsedStatRow[];
  players: readonly StatPlayer[];
  existing: readonly ExistingStatRow[];
}): StarterUpdate[] {
  const playerByCode = new Map(
    players.filter((player) => player.personCode !== "").map((player) => [player.personCode, player.id]),
  );
  const stored = new Map(existing.map((row) => [`${row.player}|${row.game_code}`, row]));

  const updates: StarterUpdate[] = [];
  for (const row of rows) {
    if (row.started === undefined) continue;
    const playerId = playerByCode.get(row.personCode);
    if (playerId === undefined) continue;
    const current = stored.get(`${playerId}|${row.gameCode}`);
    if (!current) continue;
    const started = row.started ? "yes" : "no";
    if ((current.started ?? "") !== started) updates.push({ id: current.id, started });
  }
  return updates;
}
