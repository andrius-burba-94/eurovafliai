import type PocketBase from "pocketbase";

import { describeError } from "@/lib/drafts/pipeline";
import type { FeedFetch } from "@/lib/euroleague/http";

import { upsertFixtures } from "@/lib/fixtures/store";

import { fetchGameBoxScores, fetchSeasonSchedule } from "./euroleague";
import { describeStatPlan, planStatImport, type StatPlan } from "./plan";
import {
  type ApplyResult,
  applyStatPlan,
  markStatBatch,
  readExistingStats,
  readStatPlayers,
  readStoredGameCodes,
  recordStatBatch,
  recomputeProjections,
} from "./store";
import { isPastSeason, seasonCode } from "./seasons";
import { recomputeStandings } from "./standings-store";

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
 * Half the cap goes to the oldest outstanding games and half to the newest.
 * A game the feed never fills — a forfeit, an empty box score, a game whose
 * every player is unknown — stays outstanding for good, and with the cap
 * spent oldest-first a dozen of those would starve every game after them.
 *
 * ## Failure recovery
 *
 * Identical to the CSV door's, because it *is* the CSV door's
 * (`importStatPlan`): batch first (unapplied), rows next, counts, caches,
 * applied last, and `unique(player, season, game_code)` makes a re-run plan
 * exactly the remainder. A pass that dies halfway leaves some games stored and
 * an unapplied batch saying what it meant to do — and the next pass, fifteen
 * minutes later, finishes the job without being told to. A batch left
 * unapplied because the caches failed is finished by the next pass too, even
 * one with nothing to import (`settleStatBatches`).
 */

/**
 * Rebuild the pool averages and standings while any batch of the season is
 * unapplied, then mark those batches applied. Returns the problem when the
 * rebuild fails.
 *
 * An unapplied batch is the only trace a failed rebuild leaves: its rows are
 * stored, so neither the next pass nor a re-run of the sheet has anything left
 * to write. `force` rebuilds with nothing waiting, because a concurrent settle
 * may already have marked the batch an import has just written.
 *
 * Never rebuilt for a season before the one being played. Both are caches of
 * *this* season: `players` holds one set of averages per person and every
 * season league's table is this season's. Last season's lines are loaded
 * mid-season for the scout (7.2 B), and recomputing from them would put May's
 * form on every pool row until the next round landed, and write a 2025 table
 * for a league drafted in 2026. They are stored, and nothing else moves.
 */
export async function settleStatBatches(
  pb: PocketBase,
  season: string,
  currentSeason: string,
  force = false,
): Promise<string | null> {
  const waiting = await pb.collection("stat_imports").getFullList<{ id: string }>({
    filter: `season = "${seasonCode(season)}" && applied = false`,
    fields: "id",
    requestKey: null,
  });
  if (waiting.length === 0 && !force) return null;
  try {
    if (!isPastSeason(season, currentSeason)) {
      await recomputeProjections(pb, season);
      await recomputeStandings(pb, season);
    }
  } catch (error) {
    return `Pool averages and standings were not rebuilt (${describeError(error)}); the next pass retries.`;
  }
  for (const batch of waiting) {
    await markStatBatch(pb, batch.id, { applied: true });
  }
  return null;
}

/**
 * Record a batch, write its rows, rebuild the caches, mark it applied — the
 * one sequence the fetcher and the CSV door share. The order is the
 * failure-recovery story in `store.ts`.
 */
export async function importStatPlan(
  pb: PocketBase,
  batch: Parameters<typeof recordStatBatch>[1],
  currentSeason: string,
): Promise<ApplyResult & { batchId: string; stale: string | null }> {
  const { id } = await recordStatBatch(pb, batch);
  const result = await applyStatPlan(pb, batch.plan, id);
  await markStatBatch(pb, id, {
    applied: false,
    result,
    log: [
      batch.log,
      `Applied: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`,
      ...result.failures,
    ].join("\n"),
  });
  const stale = await settleStatBatches(pb, batch.season, currentSeason, true);
  return { ...result, batchId: id, stale };
}

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
  /** Fixtures written from the same schedule request — 10.7. */
  readonly fixturesCreated: number;
  readonly fixturesUpdated: number;
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
  fixturesCreated: 0,
  fixturesUpdated: 0,
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
  if (report.fixturesCreated || report.fixturesUpdated) {
    parts.push(
      `fixtures ${report.fixturesCreated} new, ${report.fixturesUpdated} changed`,
    );
  }
  if (report.problems.length) parts.push(`${report.problems.length} problem(s)`);
  return `stats · ${report.season} · ${parts.join(", ")} · ${report.outstanding} outstanding`;
}

/**
 * Whether the season's newest batch already names every unmatched line of a
 * plan. A game whose every player is unknown stays outstanding until somebody
 * maps a code, and recording it again each pass would add a `stat_imports`
 * row every quarter of an hour that says nothing new.
 */
async function alreadyRecorded(
  pb: PocketBase,
  season: string,
  plan: StatPlan,
): Promise<boolean> {
  const { items } = await pb
    .collection("stat_imports")
    .getList<{ plan?: Partial<StatPlan> | null }>(1, 1, {
      filter: `season = "${seasonCode(season)}"`,
      sort: "-created",
      fields: "plan",
      requestKey: null,
    });
  const keys = (unmatched: StatPlan["unmatched"]) =>
    unmatched.flatMap((entry) => entry.lines.map((line) => `${entry.personCode}|${line}`));
  const known = new Set(keys(items[0]?.plan?.unmatched ?? []));
  return keys(plan.unmatched).every((key) => known.has(key));
}

export async function ingestFinishedGames({
  pb,
  season,
  doFetch = fetch,
  log,
  maxGames = 12,
  onlyGames,
  currentSeason = season,
}: {
  pb: PocketBase;
  season: string;
  /** The season being played. A pass for an earlier one rebuilds no averages or standings. */
  currentSeason?: string;
  doFetch?: FeedFetch;
  log?: (message: string) => void;
  maxGames?: number;
  /**
   * Re-fetch exactly these games, whether or not anything is stored for them.
   *
   * The one deliberate exception to "played and not stored", added by 4.2:
   * attaching a person code to a player does not bring back the lines that were
   * refused before it existed, because those games now count as imported. So
   * confirming a mapping re-runs the games that mentioned the code, and only
   * the newly matchable lines are created. A line already stored is left as it
   * is, even where the feed now says otherwise — it may be a pasted correction.
   */
  onlyGames?: readonly number[];
}): Promise<IngestReport> {
  const schedule = await fetchSeasonSchedule({
    season,
    doFetch,
    onProgress: log,
  });
  // The whole schedule, before it is narrowed to what has been played. This is
  // the request 4.3 already made and threw half of away; 10.7 keeps the other
  // half, which is the only place "who is next" can come from. It is stored
  // *before* the box scores are fetched, because it is the cheap half of the
  // pass and a pass that dies in the twelve HTTP requests below should still
  // have moved the fixtures forward.
  // What this wrote is reported through `summariseIngest` rather than logged
  // here, so a pass says each thing once.
  const fixtures = await upsertFixtures(pb, season, schedule);

  const played = schedule.filter((game) => game.played);

  const forced = onlyGames ? new Set(onlyGames) : null;
  const stored = forced ? new Set<number>() : await readStoredGameCodes(pb, season);
  const outstanding = played
    .filter((game) =>
      forced ? forced.has(game.gameCode) : !stored.has(game.gameCode),
    )
    .sort((a, b) => a.gameCode - b.gameCode);

  const base: IngestReport = {
    ...EMPTY(season),
    played: played.length,
    outstanding: outstanding.length,
    fixturesCreated: fixtures.created,
    fixturesUpdated: fixtures.updated,
    problems: fixtures.failures,
  };
  // A pass that writes nothing still finishes a batch whose caches failed.
  const quiet = async (report: IngestReport): Promise<IngestReport> => {
    const stale = await settleStatBatches(pb, season, currentSeason);
    return stale ? { ...report, problems: [...report.problems, stale] } : report;
  };
  if (outstanding.length === 0) return quiet(base);

  const half = Math.ceil(maxGames / 2);
  const queue = [
    ...outstanding.slice(0, half),
    ...outstanding.slice(Math.max(half, outstanding.length - (maxGames - half))),
  ];

  const { fetched, failed } = await fetchGameBoxScores({
    season,
    games: queue,
    doFetch,
    onProgress: log,
  });

  const rows = fetched.flatMap((game) => game.rows);
  const problems = [
    ...fixtures.failures,
    ...failed,
    ...fetched.flatMap((game) => game.problems),
  ];
  const checkedAgainstPir = fetched.reduce(
    (total, game) => total + game.checkedAgainstPir,
    0,
  );

  const attempted = {
    ...base,
    attempted: queue.length,
    checkedAgainstPir,
    problems,
  };

  if (rows.length === 0) {
    // Nothing readable. Deliberately no batch record: an empty pass over
    // fixtures that are simply not ready yet is the normal state of a season
    // between game nights, and a `stat_imports` row for each would bury the
    // ones that mean something.
    return quiet(attempted);
  }

  const players = await readStatPlayers(pb);
  const existing = await readExistingStats(
    pb,
    season,
    rows.map((row) => row.gameCode),
  );
  const planned = planStatImport({ rows, players, existing, season });
  const plan: StatPlan = forced
    ? { ...planned, updates: [], unchanged: planned.unchanged + planned.updates.length }
    : planned;
  const report = {
    ...attempted,
    unchanged: plan.unchanged,
    unmatched: plan.unmatched.length,
  };

  if (
    plan.creates.length === 0 &&
    plan.updates.length === 0 &&
    (await alreadyRecorded(pb, season, plan))
  ) {
    return quiet(report);
  }

  const imported = await importStatPlan(pb, {
    source: "api",
    season,
    rows: rows.length,
    plan,
    log: [
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
    ].join("\n"),
  }, currentSeason);

  return {
    ...report,
    created: imported.created,
    updated: imported.updated,
    unchanged: imported.unchanged,
    problems: [...problems, ...imported.failures, ...(imported.stale ? [imported.stale] : [])],
    batchId: imported.batchId,
  };
}
