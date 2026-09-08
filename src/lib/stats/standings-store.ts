import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/pipeline";
import { type Phase, PHASES } from "./csv";
import {
  computeStandings,
  phaseByRound,
  snapshotsFromStandings,
  type SnapshotRow,
  type StandingLine,
  type StandingRoster,
} from "./standings";

/**
 * Writing standings snapshots — the PocketBase half.
 *
 * Framework-free so the worker and `npm run standings:recompute` share it.
 * Stats land first; this is the derived cache, same as 4.4's projections.
 *
 * ## Failure-recovery story
 *
 * One snapshot per `(league, season, round)`. The unique index is the
 * backstop. A crash after some rounds are written leaves a mix of fresh and
 * stale rows; the next ingest or the script is the repair, because a second
 * pass upserts every round that still has a counted line. We never delete a
 * snapshot here: a later import that no longer mentions round 4 must not
 * erase it, the same trap a partial CSV must not spring on box scores.
 *
 * Until 5.1 the roster join is the newest complete draft's picks. A league
 * still in setup or drafting is skipped — there is no squad to score.
 */

type DraftRef = { id: string };
type PickRef = { member: string; player: string };
type StatRef = {
  player: string;
  round: number;
  phase: Phase;
  fantasy_pts: number;
};
type SnapshotRecord = {
  id: string;
  league: string;
  season: string;
  round: number;
  phase: Phase;
  table: SnapshotRow[];
};

export type StandingsRecompute = {
  readonly season: string;
  readonly leagues: number;
  readonly written: number;
  readonly unchanged: number;
};

function seasonCode(season: string): string {
  return season.replace(/[^A-Za-z0-9]/g, "");
}

function sameSnapshot(
  stored: SnapshotRecord,
  phase: Phase,
  table: readonly SnapshotRow[],
): boolean {
  return stored.phase === phase && JSON.stringify(stored.table) === JSON.stringify(table);
}

function rostersFromPicks(picks: readonly PickRef[]): StandingRoster[] {
  const byMember = new Map<string, string[]>();
  for (const pick of picks) {
    const ids = byMember.get(pick.member) ?? [];
    ids.push(pick.player);
    byMember.set(pick.member, ids);
  }
  return [...byMember.entries()].map(([memberId, playerIds]) => ({
    memberId,
    playerIds,
  }));
}

async function upsertSnapshot(
  pb: PocketBase,
  existing: SnapshotRecord | undefined,
  fields: {
    league: string;
    season: string;
    round: number;
    phase: Phase;
    table: readonly SnapshotRow[];
  },
): Promise<"written" | "unchanged"> {
  if (existing && sameSnapshot(existing, fields.phase, fields.table)) {
    return "unchanged";
  }
  const body = {
    league: fields.league,
    season: fields.season,
    round: fields.round,
    phase: fields.phase,
    table: fields.table,
  };
  if (existing) {
    await pb.collection("standings_snapshots").update(existing.id, body, {
      requestKey: null,
    });
    return "written";
  }
  try {
    await pb.collection("standings_snapshots").create(body, { requestKey: null });
    return "written";
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    const raced = await pb
      .collection("standings_snapshots")
      .getFullList<SnapshotRecord>({
        filter: `league = '${fields.league}' && season = "${fields.season}" && round = ${fields.round}`,
        requestKey: null,
      });
    const row = raced[0];
    if (row) {
      await pb.collection("standings_snapshots").update(row.id, body, {
        requestKey: null,
      });
    }
    return "written";
  }
}

/**
 * Recompute snapshots for every league whose draft is finished (`status =
 * season`) for one Euroleague season code (`E2026`).
 */
export async function recomputeStandings(
  pb: PocketBase,
  season: string,
): Promise<StandingsRecompute> {
  const code = seasonCode(season);
  const [leagues, lines] = await Promise.all([
    pb.collection("leagues").getFullList<{ id: string }>({
      filter: "status = 'season'",
      fields: "id",
      requestKey: null,
    }),
    pb.collection("player_game_stats").getFullList<StatRef>({
      filter: `season = "${code}"`,
      fields: "player,round,phase,fantasy_pts",
      requestKey: null,
    }),
  ]);

  const standingLines: StandingLine[] = lines.map((row) => ({
    playerId: row.player,
    round: row.round,
    phase: row.phase,
    fantasyTenths: row.fantasy_pts,
  }));

  let written = 0;
  let unchanged = 0;
  let scored = 0;

  for (const league of leagues) {
    const drafts = await pb.collection("drafts").getFullList<DraftRef>({
      filter: `league = '${league.id}' && status = 'complete'`,
      sort: "-id",
      fields: "id",
      requestKey: null,
    });
    const draft = drafts[0];
    if (!draft) continue;

    const picks = await pb.collection("picks").getFullList<PickRef>({
      filter: `draft = '${draft.id}'`,
      fields: "member,player",
      requestKey: null,
    });
    const rosters = rostersFromPicks(picks);
    if (rosters.length === 0) continue;

    scored += 1;
    const table = computeStandings(rosters, standingLines, PHASES);
    const scoredRounds = new Map<number, Phase>();
    const phases = phaseByRound(standingLines);
    for (const row of table) {
      for (const key of Object.keys(row.byRound)) {
        const round = Number(key);
        if (!scoredRounds.has(round)) {
          scoredRounds.set(round, phases.get(round) ?? "RS");
        }
      }
    }
    const snapshots = snapshotsFromStandings(table, scoredRounds);
    const existing = await pb
      .collection("standings_snapshots")
      .getFullList<SnapshotRecord>({
        filter: `league = '${league.id}' && season = "${code}"`,
        requestKey: null,
      });
    const byRound = new Map(existing.map((row) => [row.round, row]));

    for (const snap of snapshots) {
      const result = await upsertSnapshot(pb, byRound.get(snap.round), {
        league: league.id,
        season: code,
        round: snap.round,
        phase: snap.phase,
        table: snap.table,
      });
      if (result === "written") written += 1;
      else unchanged += 1;
    }
  }

  return { season: code, leagues: scored, written, unchanged };
}
