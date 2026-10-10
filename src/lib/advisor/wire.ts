import type { Position } from "@/lib/engine";

import { confidenceOf, type BaseSource, type Confidence, type Role, type Run } from "./outlook";

/**
 * The waiver wire — slice 7.2 E. Pure: the league's free agents and the stored
 * outlooks in, ranked rows out. Which players are free agents (and, in a linked
 * league, listed by its game) is the reader's business; this never adds one.
 */

export type StoredOutlook = {
  readonly player: string;
  readonly outlook_5?: number;
  readonly outlook_10?: number;
  readonly outlook_15?: number;
  readonly games_ahead?: number;
  readonly role?: string;
  readonly games_in_role?: number;
  readonly base_source?: string;
  readonly run_5?: string;
  readonly run_10?: string;
  readonly run_15?: string;
};

export type WireAgent = {
  readonly id: string;
  readonly name: string;
  readonly clubCode: string;
  readonly position: Position;
  readonly status: string;
};

export type WireOutlook = {
  /** Points a game in hundredths, next 5 / 10 / 15; null when the club has no game left. */
  readonly next: readonly [number | null, number | null, number | null];
  readonly runs: readonly [Run | null, Run | null, Run | null];
  readonly role: Role;
  readonly gamesInRole: number;
  readonly baseSource: BaseSource;
  readonly confidence: Confidence;
};

export type WireRow = WireAgent & {
  /** Null: no game in this season or last, so nothing to rate him on. */
  readonly outlook: WireOutlook | null;
};

const RUNS = new Set(["easy", "even", "hard"]);
const runOf = (value: string | undefined): Run | null => (value && RUNS.has(value) ? (value as Run) : null);

function asOutlook(row: StoredOutlook): WireOutlook {
  const ahead = (row.games_ahead ?? 0) > 0;
  const role: Role = row.role === "starter" ? "starter" : "reserve";
  const baseSource: BaseSource = row.base_source === "last" ? "last" : "current";
  const gamesInRole = row.games_in_role ?? 0;
  return {
    next: ahead ? [row.outlook_5 ?? 0, row.outlook_10 ?? 0, row.outlook_15 ?? 0] : [null, null, null],
    runs: ahead ? [runOf(row.run_5), runOf(row.run_10), runOf(row.run_15)] : [null, null, null],
    role,
    gamesInRole,
    baseSource,
    confidence: confidenceOf({ gamesInRole, baseSource }),
  };
}

export function waiverWire({
  freeAgents,
  outlooks,
}: {
  freeAgents: readonly WireAgent[];
  outlooks: readonly StoredOutlook[];
}): WireRow[] {
  const byPlayer = new Map(outlooks.map((row) => [row.player, row]));
  const rows = freeAgents.map((agent): WireRow => {
    const stored = byPlayer.get(agent.id);
    return { ...agent, outlook: stored ? asOutlook(stored) : null };
  });
  const rank = (row: WireRow) => row.outlook?.next[0] ?? Number.NEGATIVE_INFINITY;
  return rows.sort((a, b) => rank(b) - rank(a) || a.name.localeCompare(b.name));
}
