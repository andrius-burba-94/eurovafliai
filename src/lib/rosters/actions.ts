"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import { getSuperuserClient } from "@/lib/pb/superuser";

import {
  runRosterImport,
  readCurrentPlayers,
  readRosterAuthority,
} from "./apply";
import { parseCsvRoster } from "./csv";
import { assessDepartures, diffRosters } from "./diff";
import type { RosterAuthority, RosterDiff } from "./types";

/**
 * The CSV front door and the authority switch — slice 2.1b.
 *
 * ## Who may do this
 *
 * The league's rule is that the commissioner owns changes and may grant them to
 * members (`can_manage`). The roster is the one thing that is **not** per-league
 * — one canonical `players` table serves every league — so the rule is applied
 * as: you may manage the roster if you run, or help run, at least one league.
 *
 * With one friend group that is exactly "the commissioner and whoever they
 * trust". If this app ever hosts unrelated leagues, this is the function to
 * revisit, because then one league's commissioner could edit another league's
 * pool. That is written down rather than left to be discovered.
 */
export async function canManageRosters(): Promise<boolean> {
  const session = await requireSession();
  const pb = await getSuperuserClient();

  const commissions = await pb.collection("leagues").getFullList({
    filter: `commissioner = '${session.user.id}'`,
    requestKey: null,
  });
  if (commissions.length > 0) return true;

  const deputies = await pb.collection("league_members").getFullList({
    filter: `user = '${session.user.id}' && can_manage = true`,
    requestKey: null,
  });
  return deputies.length > 0;
}

export type ImportResult = {
  error: string | null;
  /** Echoed back so a refused upload does not lose the paste. */
  csv?: string;
  preview?: {
    rows: number;
    adds: number;
    changes: number;
    leaving: number;
    blocked: number;
    problems: string[];
    sample: { kind: "add" | "change" | "leaving"; text: string }[];
  };
  applied?: {
    added: number;
    changed: number;
    left: number;
    reportOnly: boolean;
  };
};

const DENIED: ImportResult = {
  error:
    "Only the commissioner, or someone they trust with it, can change the roster.",
};

/** Turn a diff into something a person can read before committing to it. */
function summarise(diff: RosterDiff, rows: number): ImportResult["preview"] {
  const sample: { kind: "add" | "change" | "leaving"; text: string }[] = [];
  for (const add of diff.adds.slice(0, 8)) {
    sample.push({
      kind: "add",
      text: `${add.name} (${add.club_code}, ${add.position})`,
    });
  }
  for (const change of diff.changes.slice(0, 8)) {
    sample.push({
      kind: "change",
      text: `${change.name}: ${Object.keys(change.fields).join(", ")}`,
    });
  }
  for (const gone of diff.leaving.slice(0, 8)) {
    sample.push({ kind: "leaving", text: `${gone.name} (${gone.club_code})` });
  }
  return {
    rows,
    adds: diff.adds.length,
    changes: diff.changes.length,
    leaving: diff.leaving.length,
    blocked: diff.blocked.length,
    problems: diff.problems,
    sample,
  };
}

/**
 * Show what a CSV would do. Writes nothing at all — not even a batch record.
 *
 * The blueprint asks for a diff preview before anything is written, and this is
 * it. Applying re-parses and re-diffs rather than trusting this result, so a
 * preview that sat in a tab for an hour cannot apply a stale plan.
 */
export async function previewRosterCsv(
  _previous: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  if (!(await canManageRosters())) return DENIED;

  const csv = String(formData.get("csv") ?? "");
  if (!csv.trim()) return { error: "Paste a CSV first.", csv };

  const { rows, problems } = parseCsvRoster(csv);
  if (rows.length === 0) {
    return {
      error: "Nothing readable in that CSV.",
      csv,
      preview: {
        rows: 0,
        adds: 0,
        changes: 0,
        leaving: 0,
        blocked: 0,
        problems,
        sample: [],
      },
    };
  }

  const pb = await getSuperuserClient();
  const current = await readCurrentPlayers(pb);
  const diff = diffRosters({ current, incoming: rows });
  diff.problems.push(...problems);

  return { error: null, csv, preview: summarise(diff, rows.length) };
}

/**
 * Apply a CSV.
 *
 * Goes through the same `runRosterImport` the API sync uses, so the batch is
 * stored, the authority gate is honoured, and the failure-recovery story is the
 * one already written down there. If `api` holds authority this deliberately
 * still runs — and writes nothing, recording the drift report instead. The page
 * says so before you press it.
 */
export async function applyRosterCsv(
  _previous: ImportResult,
  formData: FormData,
): Promise<ImportResult> {
  if (!(await canManageRosters())) return DENIED;

  const csv = String(formData.get("csv") ?? "");
  const { rows, problems } = parseCsvRoster(csv);
  if (rows.length === 0) {
    return { error: "Nothing readable in that CSV.", csv };
  }

  const pb = await getSuperuserClient();

  // The guard the development incident earned: a partial sheet marks everyone
  // missing from it as departed, and the sheet used the night before a draft is
  // the one most likely to be partial. Beyond a quarter of the pool, say so out
  // loud and make somebody tick a box.
  const current = await readCurrentPlayers(pb);
  const planned = diffRosters({ current, incoming: rows });
  const departures = assessDepartures(planned, current.length);
  // Only when this run would actually write. Under API authority the CSV path
  // records its plan and writes nothing, and asking somebody to confirm a
  // no-op is how confirmations stop being read.
  const willWrite = (await readRosterAuthority(pb)) === "csv";
  if (
    willWrite &&
    departures.alarming &&
    String(formData.get("confirm_departures")) !== "yes"
  ) {
    return {
      error:
        `This sheet would mark ${departures.count} of ${current.length} players as having left — ` +
        `${Math.round(departures.share * 100)}% of the pool. If the sheet is complete that is fine; ` +
        "if it is a partial list it is not. Tick the box to confirm.",
      csv,
      preview: summarise(planned, rows.length),
    };
  }

  const outcome = await runRosterImport({
    pb,
    incoming: rows,
    source: "csv",
    season: String(formData.get("season") ?? "E2026"),
    problems,
  });

  revalidatePath("/players");
  revalidatePath("/players/import");

  return {
    error:
      outcome.failures.length > 0
        ? `${outcome.failures.length} row(s) failed to write. The batch records why; re-applying is safe.`
        : null,
    csv,
    preview: summarise(outcome.diff, rows.length),
    applied: {
      added: outcome.written.added,
      changed: outcome.written.changed,
      left: outcome.written.left,
      reportOnly: !outcome.applied,
    },
  };
}

export type AuthorityResult = { error: string | null };

/**
 * Flip which source may write the roster.
 *
 * A single write. The other source keeps running and keeps storing what it
 * would have changed, which is the drift report decision D8 asks for — flipping
 * is not switching a source off.
 */
export async function setRosterAuthority(
  _previous: AuthorityResult,
  formData: FormData,
): Promise<AuthorityResult> {
  if (!(await canManageRosters())) {
    return { error: DENIED.error };
  }

  const next = String(formData.get("authority") ?? "");
  if (next !== "api" && next !== "csv") {
    return { error: "The roster authority is either the API or a CSV." };
  }

  const pb = await getSuperuserClient();
  const rows = await pb
    .collection("app_settings")
    .getFullList({ requestKey: null });
  const settings = rows[0];
  if (!settings) return { error: "No app settings row to update." };

  await pb.collection("app_settings").update(
    settings.id,
    { roster_authority: next as RosterAuthority },
    {
      requestKey: null,
    },
  );

  revalidatePath("/players");
  revalidatePath("/players/import");
  return { error: null };
}

export { readRosterAuthority };
