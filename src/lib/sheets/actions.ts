"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import type { Position } from "@/lib/engine";
import { getSuperuserClient } from "@/lib/pb/superuser";

import {
  matchSheet,
  resolveSheet,
  type MatchablePlayer,
  type SheetEntryStatus,
} from "./match";
import { parseCheatSheet } from "./parse";
import { deleteSheet, readMatchablePool, saveSheet } from "./store";

/**
 * The cheat sheet's front door — slice 3.4.
 *
 * Paste, read the plan, resolve whatever was ambiguous, apply. The same
 * two-step as the roster CSV (2.1b) and for the same reason, plus one this
 * surface adds: **applying re-parses and re-matches** rather than trusting the
 * preview. A plan left in a tab must not write itself against a pool that has
 * moved — and this pool moves, because ingestion runs between the day somebody
 * writes their sheet and the night they draft from it.
 *
 * ## Whose sheet
 *
 * Your own, always. PRODUCT.md calls a cheat sheet private, and this is where
 * that is enforced: the action resolves the actor's *own* membership in the
 * league and writes to that, so there is no member id on the wire for anybody
 * to change. A commissioner has no more claim on this record than anybody else
 * — the one control in this app that a deputy cannot be granted, alongside
 * deleting the league.
 *
 * ## Failure-recovery story
 *
 * One write, always: `saveSheet` upserts a single row, so there is no
 * intermediate state a crash can leave. The `unique(member)` index is the
 * backstop under the read-then-write, and the loser of that race re-reads and
 * updates — both writers wanted the same row. And a sheet is the one piece of
 * draft-adjacent state whose loss costs nothing structural: autodraft falls
 * through to its own ranking, exactly as it does for a member who never wrote
 * one.
 */

export type PlanPlayer = {
  readonly id: string;
  readonly name: string;
  readonly club: string;
  readonly position: Position;
};

/** One line of the sheet, as the confirm step shows it. */
export type PlanRow = {
  readonly lineNo: number;
  /** The name as it was written, so somebody can see what they typed. */
  readonly typed: string;
  readonly status: SheetEntryStatus;
  /** Resolved outright. Null for everything that needs a person. */
  readonly player: PlanPlayer | null;
  /** Who it might be, for an ambiguous line. */
  readonly candidates: readonly PlanPlayer[];
  /**
   * Where this line would land in the saved sheet, 1-based. Null for a line
   * that would not be saved at all.
   *
   * Computed here, from the same walk `resolveSheet` does, rather than in the
   * component. The component was numbering rows with `resolved.indexOf(row) +
   * 1`, which is both O(n²) and *wrong the moment an earlier line is
   * ambiguous*: it counts only the lines that already resolved, so answering a
   * question above you silently renumbers everything below.
   */
  readonly rank: number | null;
};

export type SheetPlan = {
  readonly rows: readonly PlanRow[];
  readonly matched: number;
  readonly ambiguous: number;
  readonly unmatched: number;
  readonly duplicates: number;
  /** How many tier breaks the sheet describes. */
  readonly tiers: number;
  readonly problems: readonly string[];
};

export type SheetResult = {
  error: string | null;
  /** Echoed back so a refused paste is not lost. */
  csv?: string;
  plan?: SheetPlan;
  saved?: { ranked: number; skipped: number; tiers: number };
  cleared?: boolean;
};

const OK: SheetResult = { error: null };

const NOT_YOURS: SheetResult = {
  error: "That is not your league to write a sheet for.",
};

/** The actor's own membership in this league, and the pool to match against. */
async function loadSheetContext(leagueId: string) {
  const session = await requireSession();
  const pb = await getSuperuserClient();

  const members = await pb.collection("league_members").getFullList<{
    id: string;
    user: string;
  }>({
    filter: `league = '${leagueId}' && user = '${session.user.id}'`,
    requestKey: null,
  });
  const own = members[0];
  // A commissioner with no membership row has no roster to rank for. Unlike
  // every other action here, there is nothing to fall back to: a sheet belongs
  // to a member, and being in charge of the league does not make you one.
  if (!own) return null;

  return { pb, memberId: own.id };
}

const show = (player: MatchablePlayer): PlanPlayer => ({
  id: player.id,
  name: player.name,
  club: player.club,
  position: player.position,
});

/**
 * Read the paste and say what it would do. Writes nothing at all.
 *
 * `resolveSheet` is run here too, purely to count the tier breaks the sheet
 * describes — the same function the apply step uses, so the number shown and
 * the number stored cannot disagree.
 */
function planFrom(
  csv: string,
  pool: readonly MatchablePlayer[],
  choices: ReadonlyMap<number, string>,
): SheetPlan {
  const { rows, problems } = parseCheatSheet(csv);
  const entries = matchSheet(rows, pool);
  const byId = new Map(pool.map((player) => [player.id, player]));

  // The same walk `resolveSheet` performs, so the ranks shown and the ranks
  // stored cannot disagree — including the duplicate rule, which is why this
  // cannot be `index + 1`.
  const used = new Set<string>();
  const planRows: PlanRow[] = entries.map((entry) => {
    const chosen = choices.get(entry.line.lineNo);
    const playerId = chosen === undefined ? entry.playerId : chosen || null;
    const player = playerId ? byId.get(playerId) : undefined;
    let rank: number | null = null;
    if (playerId && !used.has(playerId)) {
      used.add(playerId);
      rank = used.size;
    }
    return {
      lineNo: entry.line.lineNo,
      typed: entry.line.name,
      // A line somebody has answered is settled, however it started.
      status: chosen !== undefined && chosen ? "matched" : entry.status,
      player: player ? show(player) : null,
      candidates: entry.candidates.map(show),
      rank,
    };
  });

  const count = (status: SheetEntryStatus) =>
    planRows.filter((row) => row.status === status).length;

  return {
    rows: planRows,
    matched: planRows.filter((row) => row.player !== null).length,
    ambiguous: count("ambiguous"),
    unmatched: count("unmatched"),
    duplicates: count("duplicate"),
    tiers: resolveSheet(entries, choices).tiers.length,
    problems,
  };
}

/** Every `choice-<lineNo>` field the confirm step submitted. */
function choicesFrom(formData: FormData): Map<number, string> {
  const choices = new Map<number, string>();
  for (const [key, value] of formData.entries()) {
    const match = /^choice-(\d+)$/.exec(key);
    if (match && typeof value === "string") {
      choices.set(Number(match[1]), value);
    }
  }
  return choices;
}

/**
 * Read the list, save it, or throw it away — **one action, three intents**.
 *
 * Three separate `useActionState` hooks is the obvious shape and it is a trap.
 * The component then has to decide which of three results is the current one,
 * and the natural expression of that (`applied.plan ? applied : preview`) pins
 * the surface to the last *applied* plan forever: after one save, reading a new
 * list changes nothing on screen, and React 19's post-action input reset
 * restores the *old* text over what the user just typed. Verified by 3.4a's
 * critique, which reproduced it live — and `/players/import` has shipped the
 * same line since 2.1b.
 *
 * With one action there is one result, and "which is current" is not a question
 * anybody has to answer. The bug is not fixed here so much as made unavailable.
 */
export async function submitCheatSheet(
  _previous: SheetResult,
  formData: FormData,
): Promise<SheetResult> {
  const intent = String(formData.get("intent") ?? "preview");
  const leagueId = String(formData.get("leagueId") ?? "");
  const csv = String(formData.get("csv") ?? "");
  const context = await loadSheetContext(leagueId);
  if (!context) return NOT_YOURS;

  if (intent === "clear") {
    await deleteSheet(context.pb, context.memberId);
    revalidatePath(`/leagues/${leagueId}/sheet`);
    revalidatePath(`/leagues/${leagueId}/draft`);
    // `csv` is deliberately **not** echoed: the text box is about to be seeded
    // from a sheet that no longer exists, and handing back the old list would
    // make a delete look like it had failed.
    return { ...OK, cleared: true };
  }

  if (!csv.trim()) {
    return { error: "Paste a list of players first.", csv };
  }

  const choices = choicesFrom(formData);
  const pool = await readMatchablePool(context.pb);

  if (intent === "preview") {
    return { error: null, csv, plan: planFrom(csv, pool, choices) };
  }

  // Re-parsed and re-matched, not read off the preview. The pool the plan was
  // built against may have gained or lost players since — ingestion runs
  // nightly — and a sheet applied from a stale plan would rank ids that no
  // longer exist while quietly dropping ones that now do.
  const { rows } = parseCheatSheet(csv);
  const entries = matchSheet(rows, pool);
  const { ranking, tiers } = resolveSheet(entries, choices);

  if (ranking.length === 0) {
    return {
      error:
        "Nothing in that list matched a player in the pool, so there is no sheet to save.",
      csv,
      plan: planFrom(csv, pool, choices),
    };
  }

  await saveSheet(context.pb, context.memberId, { ranking, tiers }, "csv");

  revalidatePath(`/leagues/${leagueId}/sheet`);
  revalidatePath(`/leagues/${leagueId}/draft`);

  return {
    error: null,
    csv,
    plan: planFrom(csv, pool, choices),
    saved: {
      ranked: ranking.length,
      skipped: rows.length - ranking.length,
      tiers: tiers.length,
    },
  };
}
