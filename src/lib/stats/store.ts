import type PocketBase from "pocketbase";

import { describeError, isUniqueViolation } from "@/lib/drafts/pipeline";

import type {
  ExistingStatRow,
  StatPlan,
  StatPlayer,
  StatRowFields,
} from "./plan";
import {
  projectPlayer,
  type PlayerGameLine,
  type PlayerProjection,
} from "./project";
import { type SeasonAverages, storedStatsOf } from "./season-totals";

/**
 * Reading and writing box scores — the PocketBase half, and nothing else.
 *
 * **Framework-free**, like `src/lib/drafts/pipeline.ts` and
 * `src/lib/sheets/store.ts`, and for the same reason: 4.3's nightly fetcher
 * runs in the worker, a worker cannot import a `"use server"` module, and the
 * CSV door and the fetcher must land identical rows. So this takes a
 * PocketBase client and does as it is told.
 *
 * ## Failure-recovery story
 *
 * PocketBase has no transactions and one import is up to 200-odd writes. The
 * order is chosen so every reachable intermediate state is either the truth or
 * self-correcting:
 *
 * 1. **Store the batch first, unapplied.** A crash after this leaves a record
 *    saying exactly what was planned and `applied: false` — which is what
 *    happened, and is indistinguishable from a preview nobody confirmed.
 * 2. **Write the rows.** Each is independent: there is no invariant between
 *    two players' box scores, so a half-finished pass leaves some games stored
 *    and nothing inconsistent. `unique(player, season, game_code)` is the
 *    physical backstop, and a create that loses that race falls through to an
 *    update — the outcome both writers wanted.
 * 3. **Mark the batch applied last**, with the counts. A crash before this
 *    leaves `applied: false` over rows that did land: the pessimistic
 *    direction, and harmless, because
 * 4. **re-running is the repair.** `planStatImport` compares against what is
 *    actually stored, so a second run plans exactly the remainder and reports
 *    the rest as unchanged. Tested in `plan.test.ts` ("produces exactly the
 *    remainder of a half-finished run").
 *
 * The one thing this does *not* do is delete. A row that a later sheet no
 * longer mentions stays: a partial CSV must not be able to erase a round, which
 * is the same trap 2.1b hit with `left` players and mitigated rather than
 * ignored. Correcting a game means importing it again with the right numbers.
 *
 * ## Projections (4.4)
 *
 * After the rows land, `recomputeProjections` rewrites last-5 and season
 * averages on `players`, then `recomputeStandings` writes the per-round
 * table cache. Stats first, caches second: a crash between them leaves
 * stale numbers, and the next ingest or the repair scripts is the fix.
 */

type StatRecord = ExistingStatRow;

/** Every player the pool knows, in the shape the matcher needs. */
export async function readStatPlayers(pb: PocketBase): Promise<StatPlayer[]> {
  const records = await pb.collection("players").getFullList<{
    id: string;
    name: string;
    person_code?: string;
  }>({ fields: "id,name,person_code", requestKey: null });

  return records.map((record) => ({
    id: record.id,
    personCode: record.person_code ?? "",
    name: record.name,
  }));
}

/**
 * The rows already stored for a season, restricted to the games a batch is
 * about.
 *
 * Restricted on purpose: by round 38 this table holds ~9,000 rows and an
 * import is usually one round of ten games. Reading the whole season to import
 * one night would work and would get slower every week. The filter is built
 * from the batch's own game codes, which are integers we produced, so there is
 * nothing here that a paste can inject.
 */
export async function readExistingStats(
  pb: PocketBase,
  season: string,
  gameCodes: readonly number[],
): Promise<ExistingStatRow[]> {
  if (gameCodes.length === 0) return [];

  const codes = [...new Set(gameCodes)].filter((code) =>
    Number.isInteger(code),
  );
  if (codes.length === 0) return [];

  const records = await pb
    .collection("player_game_stats")
    .getFullList<StatRecord>({
      filter: `season = "${season.replace(/[^A-Za-z0-9]/g, "")}" && (${codes
        .map((code) => `game_code = ${code}`)
        .join(" || ")})`,
      requestKey: null,
    });
  return records;
}

/**
 * Which games already have anything stored for this season.
 *
 * The question 4.3's pass is built on — "what is played and not stored" — and
 * it is asked as one read of one field rather than per game, because by round
 * 38 this table holds ~9,000 rows and the pass runs every quarter of an hour.
 *
 * "Anything stored" is the right granularity even though it is coarse: a game
 * that landed with two of its 24 lines refused would be treated as done. That
 * is deliberate, because the refusals are recorded in the batch and re-fetching
 * a game whose rows are already correct would rewrite 22 rows to fix nothing.
 * The remedy for a partly-imported game is the paste box, which names what it
 * would change.
 */
export async function readStoredGameCodes(
  pb: PocketBase,
  season: string,
): Promise<Set<number>> {
  const records = await pb
    .collection("player_game_stats")
    .getFullList<{ game_code: number }>({
      filter: `season = "${season.replace(/[^A-Za-z0-9]/g, "")}"`,
      fields: "game_code",
      requestKey: null,
    });
  return new Set(records.map((record) => record.game_code));
}

export type ApplyResult = {
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** One line per row that could not be written, for the batch's log. */
  readonly failures: string[];
};

/**
 * Write a plan. Returns what it managed, rather than throwing on the first
 * refusal — one bad row must not cost the other 199, and a failure that is
 * reported can be re-run.
 */
export async function applyStatPlan(
  pb: PocketBase,
  plan: StatPlan,
  batchId: string,
): Promise<ApplyResult> {
  // Stamped on every row this run writes, so a game log can say which import
  // last touched a line. A plain text id rather than a relation: see the
  // migration's note — a pruned batch must not take box scores with it.
  const stamp = <T,>(fields: T) => ({ ...fields, import_batch: batchId });

  let created = 0;
  let updated = 0;
  const failures: string[] = [];

  for (const create of plan.creates) {
    try {
      await pb
        .collection("player_game_stats")
        .create(stamp(create.fields), { requestKey: null });
      created += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) {
        failures.push(`Line ${create.line}: ${describeError(error)}`);
        continue;
      }
      // Somebody — another tab, the fetcher, or this import re-run — created
      // this row in the window between the plan and the write. The index said
      // no; the numbers we wanted are still the numbers we want.
      try {
        const existing = await findRow(pb, create.fields);
        if (!existing) throw error;
        await pb
          .collection("player_game_stats")
          .update(existing.id, stamp(create.fields), { requestKey: null });
        updated += 1;
      } catch (retry) {
        failures.push(`Line ${create.line}: ${describeError(retry)}`);
      }
    }
  }

  for (const change of plan.updates) {
    try {
      await pb
        .collection("player_game_stats")
        .update(change.id, stamp(change.fields), { requestKey: null });
      updated += 1;
    } catch (error) {
      failures.push(`Line ${change.line}: ${describeError(error)}`);
    }
  }

  return { created, updated, unchanged: plan.unchanged, failures };
}

async function findRow(
  pb: PocketBase,
  fields: StatRowFields,
): Promise<ExistingStatRow | null> {
  const rows = await pb
    .collection("player_game_stats")
    .getFullList<StatRecord>({
      filter: `player = "${fields.player}" && season = "${fields.season}" && game_code = ${fields.game_code}`,
      requestKey: null,
    });
  return rows[0] ?? null;
}

export type StatBatch = {
  readonly id: string;
  readonly applied: boolean;
};

/** Store the batch before anything is written to `player_game_stats`. */
export async function recordStatBatch(
  pb: PocketBase,
  {
    source,
    season,
    rows,
    plan,
    log,
  }: {
    source: "api" | "csv";
    season: string;
    rows: number;
    plan: StatPlan;
    log: string;
  },
): Promise<StatBatch> {
  const record = await pb.collection("stat_imports").create<{ id: string }>(
    {
      source,
      season,
      applied: false,
      rows,
      created_rows: 0,
      updated_rows: 0,
      unchanged_rows: 0,
      plan,
      log: log.slice(0, 20000),
    },
    { requestKey: null },
  );
  return { id: record.id, applied: false };
}

/**
 * Mark a batch applied, last.
 *
 * Deliberately tolerant: a batch that cannot be marked is an audit record that
 * understates what happened, and throwing here would report an import as
 * failed after every row of it had landed. The rows are the product; the batch
 * is the story about them.
 */
export async function markStatBatchApplied(
  pb: PocketBase,
  batchId: string,
  result: ApplyResult,
  log: string,
): Promise<void> {
  try {
    await pb.collection("stat_imports").update(
      batchId,
      {
        applied: true,
        created_rows: result.created,
        updated_rows: result.updated,
        unchanged_rows: result.unchanged,
        log: log.slice(0, 20000),
      },
      { requestKey: null },
    );
  } catch {
    // Left unapplied over rows that did land — the pessimistic direction, and
    // re-running the same sheet reports them all as unchanged.
  }
}

type ProjectionRecord = {
  id: string;
  proj_last5_fantasy?: number;
  proj_last5_games?: number;
  proj_last5_pir?: number;
  proj_season_fantasy?: number;
  proj_season_games?: number;
  proj_season_pir?: number;
};

type ProjectionLine = {
  player: string;
  round: number;
  game_code: number;
  time_played: number;
  fantasy_pts: number;
  pir: number;
};

export type ProjectionRecompute = {
  readonly season: string;
  readonly players: number;
  readonly updated: number;
  readonly unchanged: number;
};

function asFields(projection: PlayerProjection) {
  return {
    proj_last5_fantasy: projection.last5Fantasy,
    proj_last5_games: projection.last5Games,
    proj_last5_pir: projection.last5Pir,
    proj_season_fantasy: projection.seasonFantasy,
    proj_season_games: projection.seasonGames,
    proj_season_pir: projection.seasonPir,
  };
}

function sameProjection(
  record: ProjectionRecord,
  projection: PlayerProjection,
): boolean {
  return (
    (record.proj_last5_fantasy ?? 0) === projection.last5Fantasy &&
    (record.proj_last5_games ?? 0) === projection.last5Games &&
    (record.proj_last5_pir ?? 0) === projection.last5Pir &&
    (record.proj_season_fantasy ?? 0) === projection.seasonFantasy &&
    (record.proj_season_games ?? 0) === projection.seasonGames &&
    (record.proj_season_pir ?? 0) === projection.seasonPir
  );
}

/**
 * Materialize last-5 and season averages onto every player for one season.
 *
 * Players with no played games in that season get games = 0, which is how
 * autodraft and the pool tell "unprojected" from "averaged 0.0". The latest
 * season written wins: there is one `players` row per person.
 */
export async function recomputeProjections(
  pb: PocketBase,
  season: string,
): Promise<ProjectionRecompute> {
  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const [players, lines] = await Promise.all([
    pb.collection("players").getFullList<ProjectionRecord>({
      fields:
        "id,proj_last5_fantasy,proj_last5_games,proj_last5_pir,proj_season_fantasy,proj_season_games,proj_season_pir",
      requestKey: null,
    }),
    pb.collection("player_game_stats").getFullList<ProjectionLine>({
      filter: `season = "${code}"`,
      fields: "player,round,game_code,time_played,fantasy_pts,pir",
      requestKey: null,
    }),
  ]);

  const byPlayer = new Map<string, PlayerGameLine[]>();
  for (const row of lines) {
    const list = byPlayer.get(row.player) ?? [];
    list.push({
      round: row.round,
      gameCode: row.game_code,
      timePlayed: row.time_played,
      fantasyTenths: row.fantasy_pts,
      pir: row.pir ?? 0,
    });
    byPlayer.set(row.player, list);
  }

  let updated = 0;
  let unchanged = 0;
  for (const player of players) {
    const projection = projectPlayer(byPlayer.get(player.id) ?? []);
    if (sameProjection(player, projection)) {
      unchanged += 1;
      continue;
    }
    await pb
      .collection("players")
      .update(player.id, asFields(projection), { requestKey: null });
    updated += 1;
  }

  return { season: code, players: players.length, updated, unchanged };
}

type PreviousSeasonRecord = {
  id: string;
  person_code?: string;
  prev_season_code?: string;
  prev_season_games?: number;
  prev_season_pir?: number;
  prev_season_fantasy?: number;
};

export type PreviousSeasonResult = {
  readonly season: string;
  readonly fetched: number;
  readonly matched: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Person codes the feed knows and our pool does not. */
  readonly unmatched: string[];
  /** One line per player whose feed average disagrees with our own backfill. */
  readonly disagreements: string[];
};

/**
 * Last season's averages, from the official stats table onto `players`.
 *
 * **The feed is the source and our backfill is the check.** The league reads
 * the official site, so a draft-night number that disagrees with it by a tenth
 * is a number nobody trusts — but we hold last season's box scores too, and
 * comparing the two is nearly free. A disagreement is *reported*, never
 * reconciled: the same rule 4.1 applies to a pasted PIR that does not match
 * its own components, and for the same reason, which is that we cannot tell
 * which of the two numbers is wrong.
 *
 * Fantasy average is ours rather than the feed's, and has to be: fantasy
 * points are PIR × 1.1 *on a win*, and a season total carries no per-game
 * result to apply that to. So a player we never backfilled gets a PIR average
 * and no fantasy average, which is honest — `averageFantasyOf` returns the
 * field and the page prints nothing when there is nothing.
 *
 * Matching is by person code only. A row with no code was already dropped by
 * `seasonAveragesFrom`, and a code our pool has never seen is reported rather
 * than guessed at by name — that is 4.2's quarantine argument, and inventing a
 * second name matcher here would be a second place for it to be wrong.
 */
export async function applyPreviousSeason(
  pb: PocketBase,
  season: string,
  averages: readonly SeasonAverages[],
  /** Run the comparison and report, write nothing. */
  { dryRun = false }: { dryRun?: boolean } = {},
): Promise<PreviousSeasonResult> {
  const code = season.replace(/[^A-Za-z0-9]/g, "");
  const [players, lines] = await Promise.all([
    pb.collection("players").getFullList<PreviousSeasonRecord>({
      fields:
        "id,person_code,prev_season_code,prev_season_games,prev_season_pir,prev_season_fantasy",
      requestKey: null,
    }),
    pb.collection("player_game_stats").getFullList<ProjectionLine>({
      filter: `season = "${code}"`,
      fields: "player,round,game_code,time_played,fantasy_pts,pir",
      requestKey: null,
    }),
  ]);

  const ours = new Map<string, PlayerGameLine[]>();
  for (const row of lines) {
    const list = ours.get(row.player) ?? [];
    list.push({
      round: row.round,
      gameCode: row.game_code,
      timePlayed: row.time_played,
      fantasyTenths: row.fantasy_pts,
      pir: row.pir ?? 0,
    });
    ours.set(row.player, list);
  }

  const byCode = new Map<string, PreviousSeasonRecord>();
  for (const player of players) {
    const personCode = (player.person_code ?? "").trim();
    if (personCode !== "") byCode.set(personCode, player);
  }

  let updated = 0;
  let unchanged = 0;
  let matched = 0;
  const unmatched: string[] = [];
  const disagreements: string[] = [];

  for (const average of averages) {
    const player = byCode.get(average.personCode);
    if (!player) {
      unmatched.push(`${average.personCode} · ${average.name}`);
      continue;
    }
    matched += 1;

    const own = projectPlayer(ours.get(player.id) ?? []);
    // Only meaningful where we actually have the season: a player we never
    // backfilled has nothing to disagree with.
    if (own.seasonGames > 0 && own.seasonPir !== average.pir) {
      disagreements.push(
        `${average.name} (${average.personCode}): feed ${average.pir} vs ours ${own.seasonPir} over ${own.seasonGames} game(s)`,
      );
    }

    const fields = {
      prev_season_code: code,
      prev_season_games: average.games,
      prev_season_pir: average.pir,
      prev_season_fantasy: own.seasonGames > 0 ? own.seasonFantasy : 0,
      prev_season_stats: storedStatsOf(average),
    };
    if (
      (player.prev_season_code ?? "") === fields.prev_season_code &&
      (player.prev_season_games ?? 0) === fields.prev_season_games &&
      (player.prev_season_pir ?? 0) === fields.prev_season_pir &&
      (player.prev_season_fantasy ?? 0) === fields.prev_season_fantasy
    ) {
      unchanged += 1;
      continue;
    }

    if (!dryRun) {
      await pb
        .collection("players")
        .update(player.id, fields, { requestKey: null });
    }
    updated += 1;
  }

  return {
    season: code,
    fetched: averages.length,
    matched,
    updated,
    unchanged,
    unmatched,
    disagreements,
  };
}
