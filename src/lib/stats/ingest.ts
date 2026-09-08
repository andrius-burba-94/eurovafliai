import type PocketBase from "pocketbase";

import type { FeedFetch } from "@/lib/euroleague/http";

import {
  fetchGameBoxScores,
  fetchSeasonSchedule,
  type ScheduledGame,
} from "./euroleague";
import { describeStatPlan, planStatImport } from "./plan";
import {
  applyStatPlan,
  markStatBatchApplied,
  readExistingStats,
  readStatPlayers,
  readStoredGameCodes,
  recordStatBatch,
  recomputeProjections,
} from "./store";

/**
 * One ingest pass — slice 4.3.
 *
 * **Framework-free**, like the pick pipeline: the worker runs this every
 * quarter of an hour and a worker cannot import a `"use server"` module. It is
 * also the only thing the manual script runs, so "what the worker does" is
 * never a second implementation of "what I can do by hand".
 *
 * ## The pass is a question about the season, not about tonight
 *
 * Fetch the schedule, keep the games that are **played** and **not already
 * stored**, import those. That is one HTTP request to answer "what is
 * outstanding", and it makes the fetcher self-healing by construction: a game
 * missed because the box was down, because a parse failed, or because nobody
 * ran the worker for a fortnight, is simply still outstanding on the next
 * pass. There is no backfill path because there is nothing for one to do.
 *
 * The cost of that shape is that it will not notice an **amended** box score
 * for a game it has already stored — the Euroleague does amend them. That is a
 * deliberate deferral, not an oversight: correcting a stored game means
 * pasting it into `/stats/import`, which names every field it would change
 * before it changes it. Recorded as debt in STATUS.md.
 *
 * ## Bounded, so one pass cannot become an afternoon
 *
 * `maxGames` caps a pass at twelve games — a full round plus slack. The first
 * pass of a season that already has 380 games played would otherwise be 380
 * requests in one tick, which is both rude to somebody else's API and a tick
 * that never returns. Twelve at a time, every fifteen minutes, backfills a
 * whole season in about eight hours and needs nobody's attention.
 *
 * ## Failure recovery
 *
 * Identical to the CSV door's, because it *is* the CSV door's: batch first
 * (unapplied), rows next, mark applied last, and `unique(player, season,
 * game_code)` makes a re-run plan exactly the remainder. A pass that dies
 * halfway leaves some games stored and an unapplied batch saying what it
 * meant to do — and the next pass, fifteen minutes later, finishes the job
 * without being told to. Projections recompute after any pass that wrote a
 * row; if that write dies, `npm run stats:project` is the repair.
 */

export type IngestReport = {
  readonly season: string;
  /** Games the schedule says are played. */
  readonly played: number;
  /** Played games with nothing stored for them. */
  readonly outstanding: number;
  /** Games this pass tried, after the cap. */
  readonly attempted: number;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Person codes the pool has never heard of — 4.2's input. */
  readonly unmatched: number;
  readonly checkedAgainstPir: number;
  /** Everything that went wrong, each naming its game. */
  readonly problems: string[];
  readonly batchId: string | null;
};

const EMPTY = (season: string): IngestReport => ({
  season,
  played: 0,
  outstanding: 0,
  attempted: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  unmatched: 0,
  checkedAgainstPir: 0,
  problems: [],
  batchId: null,
});

/** A one-line summary for the worker log. Silent passes say nothing. */
export function summariseIngest(report: IngestReport): string {
  const parts = [
    `${report.attempted} game(s)`,
    `${report.created} new`,
  ];
  if (report.updated) parts.push(`${report.updated} corrected`);
  if (report.unchanged) parts.push(`${report.unchanged} already stored`);
  if (report.unmatched) parts.push(`${report.unmatched} unmatched code(s)`);
  if (report.problems.length) parts.push(`${report.problems.length} problem(s)`);
  return `stats · ${report.season} · ${parts.join(", ")} · ${report.outstanding} outstanding`;
}

export async function ingestFinishedGames({
  pb,
  season,
  doFetch = fetch,
  log,
  maxGames = 12,
  onlyGames,
}: {
  pb: PocketBase;
  season: string;
  doFetch?: FeedFetch;
  log?: (message: string) => void;
  maxGames?: number;
  /**
   * Re-fetch exactly these games, whether or not anything is stored for them.
   *
   * The one deliberate exception to "played and not stored", added by 4.2:
   * attaching a person code to a player does not bring back the lines that were
   * refused before it existed, because those games now count as imported. So
   * confirming a mapping re-runs the games that mentioned the code, and the
   * plan handles it from there — the rows that already exist come back as
   * `unchanged`, and only the newly matchable ones are created.
   */
  onlyGames?: readonly number[];
}): Promise<IngestReport> {
  const schedule = await fetchSeasonSchedule({
    season,
    doFetch,
    onProgress: log,
  });
  const played = schedule.filter((game) => game.played);

  const forced = onlyGames ? new Set(onlyGames) : null;
  const stored = forced ? new Set<number>() : await readStoredGameCodes(pb, season);
  const outstanding = played.filter((game) =>
    forced ? forced.has(game.gameCode) : !stored.has(game.gameCode),
  );

  const report = EMPTY(season);
  if (outstanding.length === 0) {
    return { ...report, played: played.length };
  }

  // Oldest first, so a backfill fills the season in the order it was played
  // and a half-done backfill leaves a prefix rather than a scatter.
  const queue: ScheduledGame[] = [...outstanding]
    .sort((a, b) => a.gameCode - b.gameCode)
    .slice(0, maxGames);

  const { fetched, failed } = await fetchGameBoxScores({
    season,
    games: queue,
    doFetch,
    onProgress: log,
  });

  const rows = fetched.flatMap((game) => game.rows);
  const problems = [...failed, ...fetched.flatMap((game) => game.problems)];
  const checkedAgainstPir = fetched.reduce(
    (total, game) => total + game.checkedAgainstPir,
    0,
  );

  const base = {
    ...report,
    played: played.length,
    outstanding: outstanding.length,
    attempted: queue.length,
    checkedAgainstPir,
    problems,
  };

  if (rows.length === 0) {
    // Nothing readable. Deliberately no batch record: an empty pass over
    // fixtures that are simply not ready yet is the normal state of a season
    // between game nights, and a `stat_imports` row for each would bury the
    // ones that mean something.
    return base;
  }

  const players = await readStatPlayers(pb);
  const existing = await readExistingStats(
    pb,
    season,
    rows.map((row) => row.gameCode),
  );
  const plan = planStatImport({ rows, players, existing, season });

  const log0 = [
    describeStatPlan(plan),
    `${rows.length} rows fetched from ${queue.length} game(s); ${outstanding.length} outstanding before this pass.`,
    checkedAgainstPir > 0
      ? `${checkedAgainstPir} rows carried the feed's own PIR and agreed with ours.`
      : "No row carried a PIR, so nothing self-checked — worth investigating.",
    ...plan.unmatched.map(
      (entry) =>
        `No player with person code ${entry.personCode} (game${entry.lines.length === 1 ? "" : "s"} ${entry.lines.join(", ")}).`,
    ),
    ...problems,
  ].join("\n");

  const batch = await recordStatBatch(pb, {
    source: "api",
    season,
    rows: rows.length,
    plan,
    log: log0,
  });

  const applied = await applyStatPlan(pb, plan, batch.id);

  if (applied.created + applied.updated > 0) {
    await recomputeProjections(pb, season);
  }

  await markStatBatchApplied(
    pb,
    batch.id,
    applied,
    [
      log0,
      `Applied: ${applied.created} created, ${applied.updated} updated, ${applied.unchanged} unchanged.`,
      ...applied.failures,
    ].join("\n"),
  );

  return {
    ...base,
    created: applied.created,
    updated: applied.updated,
    unchanged: applied.unchanged,
    unmatched: plan.unmatched.length,
    problems: [...problems, ...applied.failures],
    batchId: batch.id,
  };
}
