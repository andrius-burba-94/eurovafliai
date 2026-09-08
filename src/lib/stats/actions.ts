"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { serverConfig } from "@/lib/config/server";
import { getSuperuserClient } from "@/lib/pb/superuser";
import { canManageRosters } from "@/lib/rosters/actions";

import { CSV_TEMPLATE_HEADER, parseStatCsv } from "./csv";
import { describeStatPlan, planStatImport, type StatPlan } from "./plan";
import {
  applyStatPlan,
  markStatBatchApplied,
  readExistingStats,
  readStatPlayers,
  recordStatBatch,
  recomputeProjections,
} from "./store";
import { recomputeStandings } from "./standings-store";

/**
 * The stat CSV front door — slice 4.1.
 *
 * ## One action, two intents
 *
 * Preview and apply are the **same** action with an `intent` field, not two
 * `useActionState`s on one form. AGENTS.md records why: two of them force the
 * component to decide which result is current, and the natural way to write
 * that (`applied.plan ? applied : preview`) pins the surface to the last
 * *applied* result forever. It shipped broken in 2.1b, was found by 3.4a's
 * critique, and the roster importer still carries the small version of the fix.
 * A new surface gets the shape that works.
 *
 * ## Applying re-reads and re-plans
 *
 * The apply intent does not trust the preview it was shown. It re-parses the
 * text, re-reads what is stored and re-plans, so a preview that sat in a tab
 * while the nightly fetcher ran cannot write a stale plan over fresher numbers.
 * Same rule as `applyRosterCsv`.
 *
 * ## Who may do this
 *
 * `canManageRosters` — the commissioner of at least one league, or a member
 * they trust with it. Stats are not per-league (one `players` table, one set of
 * box scores, every league scoring off them), so the permission is the same one
 * the pool uses, with the same caveat written down there: if this app ever
 * hosts unrelated leagues, this is a function to revisit.
 */

export type StatImportResult = {
  error: string | null;
  /** Echoed so a refused paste is never swallowed. */
  csv?: string;
  season?: string;
  preview?: {
    rows: number;
    creates: number;
    updates: number;
    unchanged: number;
    games: number;
    rounds: number[];
    sentence: string;
    /** Rows refused by the parser, each naming its line. */
    problems: string[];
    /** How many rows carried the Euroleague's own PIR and agreed with ours. */
    checkedAgainstPir: number;
    ignoredColumns: string[];
    unmatched: { personCode: string; lines: number[] }[];
    /** A few corrections, spelled out, because a correction rewrites history. */
    corrections: string[];
  };
  applied?: {
    created: number;
    updated: number;
    unchanged: number;
    failures: string[];
    batchId: string;
  };
};

const DENIED: StatImportResult = {
  error:
    "Only the commissioner, or someone they trust with it, can import stats.",
};

/** The season a paste belongs to, sanitised to the shape a season code has. */
function readSeason(formData: FormData): string {
  const raw = String(formData.get("season") ?? "").trim().toUpperCase();
  return /^E\d{4}$/.test(raw) ? raw : serverConfig().EUROLEAGUE_SEASON;
}

function summarise(
  plan: StatPlan,
  rows: number,
  problems: string[],
  ignoredColumns: string[],
  checkedAgainstPir: number,
): NonNullable<StatImportResult["preview"]> {
  return {
    rows,
    creates: plan.creates.length,
    updates: plan.updates.length,
    unchanged: plan.unchanged,
    games: plan.games,
    rounds: plan.rounds,
    sentence: describeStatPlan(plan),
    problems,
    checkedAgainstPir,
    ignoredColumns,
    unmatched: plan.unmatched.map((entry) => ({ ...entry })),
    // A correction is the one thing here that changes a number somebody may
    // already have seen in the standings, so the preview names them
    // individually rather than counting them.
    corrections: plan.updates.slice(0, 8).map((update) => {
      const changes = update.changes
        .slice(0, 4)
        .map((change) => `${change.field} ${change.from} → ${change.to}`)
        .join(", ");
      return `Line ${update.line}: ${changes}${
        update.changes.length > 4 ? ", …" : ""
      }`;
    }),
  };
}

export async function submitStatCsv(
  _previous: StatImportResult,
  formData: FormData,
): Promise<StatImportResult> {
  if (!(await canManageRosters())) return DENIED;
  await requireSession();

  const csv = String(formData.get("csv") ?? "");
  const season = readSeason(formData);
  const apply = String(formData.get("intent")) === "apply";

  if (!csv.trim()) {
    return { error: "Paste a box score first.", csv, season };
  }

  const { rows, problems, ignoredColumns, checkedAgainstPir } =
    parseStatCsv(csv);

  const pb = await getSuperuserClient();
  const players = await readStatPlayers(pb);
  const existing = await readExistingStats(
    pb,
    season,
    rows.map((row) => row.gameCode),
  );
  const plan = planStatImport({ rows, players, existing, season });
  const preview = summarise(
    plan,
    rows.length,
    problems,
    ignoredColumns,
    checkedAgainstPir,
  );

  if (rows.length === 0) {
    return {
      error:
        problems.length > 0
          ? "Nothing in that sheet could be read. Every line is listed below."
          : `Nothing readable in that sheet. The header must name: ${CSV_TEMPLATE_HEADER}`,
      csv,
      season,
      preview,
    };
  }

  if (!apply) return { error: null, csv, season, preview };

  if (plan.creates.length === 0 && plan.updates.length === 0) {
    // Not an error: it is what re-running an already-imported round looks
    // like, and saying so is more useful than a batch record nobody asked for.
    return {
      error: null,
      csv,
      season,
      preview,
      applied: {
        created: 0,
        updated: 0,
        unchanged: plan.unchanged,
        failures: [],
        batchId: "",
      },
    };
  }

  const log = [
    describeStatPlan(plan),
    `${rows.length} rows read, ${problems.length} refused by the parser.`,
    checkedAgainstPir > 0
      ? `${checkedAgainstPir} rows carried the official PIR and agreed with ours.`
      : "The sheet carried no PIR column, so nothing self-checked.",
    ...plan.unmatched.map(
      (entry) =>
        `No player with person code ${entry.personCode} (lines ${entry.lines.join(", ")}).`,
    ),
    ...problems,
  ].join("\n");

  // The batch first, unapplied — see the failure-recovery story in `store.ts`.
  const batch = await recordStatBatch(pb, {
    source: "csv",
    season,
    rows: rows.length,
    plan,
    log,
  });

  const result = await applyStatPlan(pb, plan, batch.id);

  if (result.created + result.updated > 0) {
    await recomputeProjections(pb, season);
    await recomputeStandings(pb, season);
  }

  await markStatBatchApplied(
    pb,
    batch.id,
    result,
    [
      log,
      `Applied: ${result.created} created, ${result.updated} updated, ${result.unchanged} unchanged.`,
      ...result.failures,
    ].join("\n"),
  );

  revalidatePath("/stats/import");
  revalidatePath("/players");
  revalidatePath("/leagues", "layout");

  return {
    error:
      result.failures.length > 0
        ? `${result.failures.length} row${result.failures.length === 1 ? "" : "s"} could not be written. The rest landed; re-run the same sheet to retry them.`
        : null,
    csv,
    season,
    preview,
    applied: { ...result, batchId: batch.id },
  };
}

export type StatsOverview = {
  readonly season: string;
  readonly rows: number;
  readonly rounds: number[];
  readonly batches: {
    readonly id: string;
    readonly created: string;
    readonly source: string;
    readonly applied: boolean;
    readonly rows: number;
    readonly createdRows: number;
    readonly updatedRows: number;
  }[];
};

/**
 * What is already stored, so the page opens by saying where the season is
 * rather than by asking for a paste.
 *
 * The round list is read from the stored rows rather than counted, because
 * "rounds 1–4" is a claim about which rounds exist and a count would say "4"
 * for a season missing round 2.
 */
export async function readStatsOverview(
  season = serverConfig().EUROLEAGUE_SEASON,
): Promise<StatsOverview> {
  const pb = await getSuperuserClient();

  const rows = await pb.collection("player_game_stats").getFullList<{
    round: number;
  }>({
    filter: `season = "${season}"`,
    fields: "round",
    requestKey: null,
  });

  const batches = await pb.collection("stat_imports").getList<{
    id: string;
    created: string;
    source: string;
    applied: boolean;
    rows: number;
    created_rows: number;
    updated_rows: number;
  }>(1, 5, { sort: "-created", requestKey: null });

  return {
    season,
    rows: rows.length,
    rounds: [...new Set(rows.map((row) => row.round))].sort((a, b) => a - b),
    batches: batches.items.map((batch) => ({
      id: batch.id,
      created: batch.created,
      source: batch.source,
      applied: batch.applied,
      rows: batch.rows ?? 0,
      createdRows: batch.created_rows ?? 0,
      updatedRows: batch.updated_rows ?? 0,
    })),
  };
}
