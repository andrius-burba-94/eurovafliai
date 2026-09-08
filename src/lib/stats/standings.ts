import { type Phase, PHASES } from "./csv";
import { sumTenths } from "./scoring";

/**
 * Standings from rosters × game lines — slice 4.5.
 *
 * Framework-free, next to scoring, for the same reason scoring is: the worker
 * recomputes after an ingest, a script repairs a crash, and a page filters by
 * phase. Three callers, one sum.
 *
 * Until 5.1 there is no `roster_memberships` table. A member's squad is the
 * players they picked on the newest complete draft. Missing a line is 0, not
 * "skip this round" — a DNP still occupied a roster slot that night.
 *
 * Ties break on `memberId`, the same total-then-id discipline autodraft uses
 * when two legal players score the same.
 */

export type StandingRoster = {
  readonly memberId: string;
  readonly playerIds: readonly string[];
};

export type StandingLine = {
  readonly playerId: string;
  readonly round: number;
  readonly phase: Phase;
  readonly fantasyTenths: number;
};

export type StandingRow = {
  readonly memberId: string;
  readonly totalTenths: number;
  readonly byRound: Readonly<Record<number, number>>;
};

export type SnapshotRow = {
  readonly memberId: string;
  readonly totalTenths: number;
  readonly roundTenths: number;
};

export type RoundSnapshot = {
  readonly round: number;
  readonly phase: Phase;
  readonly table: readonly SnapshotRow[];
};

export { PHASES, type Phase };

function allowed(phases: readonly Phase[]): ReadonlySet<Phase> {
  return new Set(phases);
}

function tenthsByPlayerRound(
  lines: readonly StandingLine[],
  phases: ReadonlySet<Phase>,
): Map<string, Map<number, number>> {
  const byPlayer = new Map<string, Map<number, number>>();
  for (const line of lines) {
    if (!phases.has(line.phase)) continue;
    const byRound = byPlayer.get(line.playerId) ?? new Map<number, number>();
    byRound.set(
      line.round,
      (byRound.get(line.round) ?? 0) + line.fantasyTenths,
    );
    byPlayer.set(line.playerId, byRound);
  }
  return byPlayer;
}

function rankRows(rows: StandingRow[]): StandingRow[] {
  return [...rows].sort((a, b) => {
    if (b.totalTenths !== a.totalTenths) return b.totalTenths - a.totalTenths;
    return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
  });
}

/**
 * One ranked table. `phases` is the filter the page will expose; pass every
 * stored phase when writing snapshots so a later toggle does not need a
 * recompute.
 */
export function computeStandings(
  rosters: readonly StandingRoster[],
  lines: readonly StandingLine[],
  phases: readonly Phase[],
): StandingRow[] {
  const byPlayer = tenthsByPlayerRound(lines, allowed(phases));
  const rows: StandingRow[] = rosters.map((roster) => {
    const byRound: Record<number, number> = {};
    const seen = new Set<string>();
    for (const playerId of roster.playerIds) {
      if (seen.has(playerId)) continue;
      seen.add(playerId);
      const scored = byPlayer.get(playerId);
      if (!scored) continue;
      for (const [round, tenths] of scored) {
        byRound[round] = (byRound[round] ?? 0) + tenths;
      }
    }
    return {
      memberId: roster.memberId,
      totalTenths: sumTenths(Object.values(byRound)),
      byRound,
    };
  });
  return rankRows(rows);
}

/**
 * Per-round snapshot payloads from a full (unfiltered) table.
 *
 * `totalTenths` is season-to-date through that round, all phases the table
 * already counted. The page that filters by phase ignores it and re-sums
 * `roundTenths` from the snapshots whose `phase` is selected.
 */
export function snapshotsFromStandings(
  rows: readonly StandingRow[],
  phaseOfRound: ReadonlyMap<number, Phase>,
): RoundSnapshot[] {
  const rounds = [...phaseOfRound.keys()].sort((a, b) => a - b);
  return rounds.map((round) => {
    const through = rankRows(
      rows.map((row) => {
        const roundTenths = row.byRound[round] ?? 0;
        const totalTenths = sumTenths(
          rounds.filter((r) => r <= round).map((r) => row.byRound[r] ?? 0),
        );
        return { memberId: row.memberId, totalTenths, byRound: { [round]: roundTenths } };
      }),
    );
    return {
      round,
      phase: phaseOfRound.get(round) ?? "RS",
      table: through.map((row) => ({
        memberId: row.memberId,
        totalTenths: row.totalTenths,
        roundTenths: row.byRound[round] ?? 0,
      })),
    };
  });
}

export function phaseByRound(
  lines: readonly StandingLine[],
): Map<number, Phase> {
  const out = new Map<number, Phase>();
  for (const line of lines) {
    if (!out.has(line.round)) out.set(line.round, line.phase);
  }
  return out;
}

/**
 * Rebuild the visible table from stored round slices, counting only the
 * phases the viewer asked for.
 */
export function tableFromSnapshots(
  snapshots: readonly RoundSnapshot[],
  phases: readonly Phase[],
): { rounds: number[]; rows: StandingRow[] } {
  const wanted = allowed(phases);
  const counted = snapshots
    .filter((snap) => wanted.has(snap.phase))
    .slice()
    .sort((a, b) => a.round - b.round);
  const rounds = counted.map((snap) => snap.round);
  const memberIds = new Set<string>();
  for (const snap of counted) {
    for (const row of snap.table) memberIds.add(row.memberId);
  }
  const rows = rankRows(
    [...memberIds].map((memberId) => {
      const byRound: Record<number, number> = {};
      for (const snap of counted) {
        const hit = snap.table.find((row) => row.memberId === memberId);
        byRound[snap.round] = hit?.roundTenths ?? 0;
      }
      return {
        memberId,
        totalTenths: sumTenths(Object.values(byRound)),
        byRound,
      };
    }),
  );
  return { rounds, rows };
}
