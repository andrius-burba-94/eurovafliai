import type PocketBase from "pocketbase";

import { readPicks } from "@/lib/drafts/pipeline";
import { isUniqueViolation } from "@/lib/drafts/unique";
import { readLineupWeights } from "@/lib/lineups/store";
import { isActiveMembership } from "@/lib/memberships/from";
import { materializeDraftMemberships } from "@/lib/memberships/store";
import { type Phase, PHASES } from "./csv";
import {
  computeStandings,
  phaseByRound,
  snapshotsFromStandings,
  type SnapshotRow,
  type StandingLine,
  type StandingWindow,
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
 * Once any window is closed, a member's nights follow `from_round`/`to_round`
 * (not calendar `from_date`). An open draft window still owns every round, so
 * an E2025 backfill matches 4.5 until the first trade.
 *
 * A season league whose open memberships do not fill its completed draft
 * rematerializes the missing rows — the crash between `advance` and the
 * membership loop. Once any window is closed, rematerializing from picks
 * would reopen a dropped player, so we stop.
 *
 * Lineups (9.3) are read per league and applied here, so recording one is a
 * recompute rather than a rescore: box scores are app-global and never carry
 * a league's captain.
 */

type DraftRef = {
  id: string;
  order?: unknown;
  rounds?: number;
  updated?: string;
};
type MembershipRef = {
  member: string;
  player: string;
  to_date?: string | null;
  from_round?: number | null;
  to_round?: number | null;
};
type StatRef = {
  id: string;
  player: string;
  round: number;
  phase: Phase;
  fantasy_pts: number;
  game_code: number;
  basketnews_raw_pts?: number;
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

function windowsFromMemberships(
  rows: readonly MembershipRef[],
): StandingWindow[] {
  return rows.map((row) => ({
    memberId: row.member,
    playerId: row.player,
    from_round: row.from_round,
    to_round: row.to_round,
    to_date: row.to_date,
  }));
}

function fromDraftStamp(raw: string | undefined): Date {
  if (!raw) return new Date(0);
  const parsed = new Date(raw.includes("T") ? raw : raw.replace(" ", "T"));
  return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
}

function expectedRosterRows(draft: DraftRef): number | null {
  if (!Array.isArray(draft.order) || typeof draft.rounds !== "number") {
    return null;
  }
  return draft.order.length * draft.rounds;
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
  options?: { readonly leagueId?: string },
): Promise<StandingsRecompute> {
  const code = seasonCode(season);
  const leagueFilter = options?.leagueId
    ? `status = 'season' && id = '${options.leagueId}'`
    : "status = 'season'";
  const [leagues, lines] = await Promise.all([
    pb.collection("leagues").getFullList<{ id: string; basketnews_league_id?: string }>({
      filter: leagueFilter,
      fields: "id,basketnews_league_id",
      requestKey: null,
    }),
    pb.collection("player_game_stats").getFullList<StatRef>({
      filter: `season = "${code}"`,
      fields: "id,player,round,phase,fantasy_pts,game_code,basketnews_raw_pts",
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
    if (league.basketnews_league_id) {
      const [members, lineups, existing] = await Promise.all([
        pb.collection("league_members").getFullList<{ id: string }>({ filter: `league = '${league.id}'`, fields: "id", requestKey: null }),
        pb.collection("round_lineups").getFullList<{ member: string; round: number; basketnews_result?: { totalHundredths?: number; players?: { playerId: string; rawHundredths: number }[] } }>({
          filter: `league = '${league.id}' && season = "${code}"`,
          fields: "member,round,basketnews_result", requestKey: null,
        }),
        pb.collection("standings_snapshots").getFullList<SnapshotRecord>({ filter: `league = '${league.id}' && season = "${code}"`, requestKey: null }),
      ]);
      const byRound = new Map<number, Map<string, number>>();
      const sourcePlayerPoints = new Map<string, number>();
      for (const row of lineups) {
        const value = row.basketnews_result?.totalHundredths;
        if (typeof value !== "number" || !Number.isInteger(value)) continue;
        const table = byRound.get(row.round) ?? new Map<string, number>();
        table.set(row.member, value);
        byRound.set(row.round, table);
        for (const player of row.basketnews_result?.players ?? []) {
          sourcePlayerPoints.set(`${player.playerId}|${row.round}`, player.rawHundredths);
        }
      }
      // A game-stat row is per game while BasketNews publishes one raw value
      // per round. Anchor that exact value to the first game, zeroing later
      // games so a sum of the rows remains the published round score.
      const byPlayerRound = new Map<string, StatRef[]>();
      for (const line of lines) {
        const key = `${line.player}|${line.round}`;
        if (!sourcePlayerPoints.has(key)) continue;
        byPlayerRound.set(key, [...(byPlayerRound.get(key) ?? []), line]);
      }
      for (const [key, playerLines] of byPlayerRound) {
        playerLines.sort((a, b) => a.game_code - b.game_code);
        for (const [index, line] of playerLines.entries()) {
          const value = index === 0 ? sourcePlayerPoints.get(key)! : 0;
          if (line.basketnews_raw_pts !== value) {
            await pb.collection("player_game_stats").update(line.id, { basketnews_raw_pts: value }, { requestKey: null });
          }
        }
      }
      const complete = [...byRound].filter(([, table]) => members.length > 0 && members.every((member) => table.has(member.id)));
      const rows = members.map((member) => ({
        memberId: member.id,
        totalHundredths: complete.reduce((sum, [, table]) => sum + table.get(member.id)!, 0),
        byRound: Object.fromEntries(complete.map(([round, table]) => [round, table.get(member.id)!])),
      }));
      const phases = phaseByRound(standingLines);
      const snapshots = snapshotsFromStandings(rows, new Map(complete.map(([round]) => [round, phases.get(round) ?? "RS"])));
      const stored = new Map(existing.map((row) => [row.round, row]));
      for (const snap of snapshots) {
        const result = await upsertSnapshot(pb, stored.get(snap.round), { league: league.id, season: code, round: snap.round, phase: snap.phase, table: snap.table });
        if (result === "written") written += 1;
        else unchanged += 1;
      }
      scored += 1;
      continue;
    }
    const drafts = await pb.collection("drafts").getFullList<DraftRef>({
      filter: `league = '${league.id}' && status = 'complete'`,
      sort: "-id",
      fields: "id,order,rounds,updated",
      requestKey: null,
    });
    const draft = drafts[0];
    if (!draft) continue;

    const stored = await pb
      .collection("roster_memberships")
      .getFullList<MembershipRef>({
        filter: `league = '${league.id}'`,
        fields: "member,player,to_date,from_round,to_round",
        requestKey: null,
      });
    const hasClosed = stored.some((row) => !isActiveMembership(row.to_date));
    let memberships = stored;
    const open = stored.filter((row) => isActiveMembership(row.to_date));
    const expected = expectedRosterRows(draft);
    if (!hasClosed && (expected === null || open.length < expected)) {
      const picks = await readPicks(pb, draft.id);
      await materializeDraftMemberships(
        pb,
        { id: draft.id, league: league.id },
        picks,
        fromDraftStamp(draft.updated),
      );
      memberships = await pb
        .collection("roster_memberships")
        .getFullList<MembershipRef>({
          filter: `league = '${league.id}'`,
          fields: "member,player,to_date,from_round,to_round",
          requestKey: null,
        });
    }

    const windows = windowsFromMemberships(memberships);
    if (windows.length === 0) continue;

    scored += 1;
    const weights = await readLineupWeights(
      pb,
      league.id,
      code,
      [...new Set(standingLines.map((line) => line.round))],
      [...new Set(windows.map((window) => window.memberId))],
    );
    const table = computeStandings(windows, standingLines, PHASES, weights);
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
