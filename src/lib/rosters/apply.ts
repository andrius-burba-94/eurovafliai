/**
 * Storing an import batch, and applying it if its source holds authority.
 *
 * The only PocketBase-writing module in the ingestion pipeline. It takes a
 * superuser client as an argument rather than importing one, so the same code
 * serves a server action (which gets it from `getSuperuserClient`) and the sync
 * script (which builds one from plain-Node env, because `server-only` throws
 * outside a React Server Component graph — see AGENTS.md).
 *
 * ## Failure-recovery story
 *
 * PocketBase has no transactions, and one import is up to 324 writes. The order
 * here is chosen so that every reachable intermediate state is either harmless
 * or self-correcting on the next run:
 *
 * 1. **Store the batch first, unapplied.** A crash after this leaves an audit
 *    record saying what was planned and `applied: false` — which is exactly the
 *    truth, and exactly what a report-only run looks like.
 * 2. **Write players.** Each is an independent create or update; there is no
 *    cross-record invariant between two players, so a half-finished pass leaves
 *    the pool partly updated and nothing inconsistent. The unique indexes are
 *    the physical backstop: a duplicate person code or a duplicate
 *    (name_normalized, club_code) is refused by the database, not by this code.
 * 3. **Mark the batch applied last**, with the per-row results. A crash before
 *    this leaves `applied: false` on a batch whose players were partly written —
 *    the pessimistic direction, and re-running is safe because the diff is
 *    recomputed from what is actually in the table.
 *
 * Re-running is the repair. `diffRosters` compares against current state, so an
 * unchanged roster produces an empty diff and writes nothing; a partly-applied
 * batch produces exactly the remainder. That property is tested in
 * `diff.test.ts` ("is empty for an unchanged roster").
 */
import type PocketBase from "pocketbase";

import { diffRosters } from "./diff";
import type {
  ExistingPlayer,
  NormalizedPlayer,
  RosterAuthority,
  RosterDiff,
} from "./types";

/** The `players` fields this pipeline owns, as PocketBase stores them. */
type PlayerRecord = {
  id: string;
  name: string;
  name_normalized: string;
  club_code: string;
  club_name: string;
  position: "G" | "F" | "C";
  status: ExistingPlayer["status"];
  person_code: string;
  source: ExistingPlayer["source"];
  manual_lock: boolean;
  dorsal: string;
};

/**
 * Read the whole pool. 324 rows, so paging exists for correctness rather than
 * for size — `getFullList` follows it.
 */
export async function readCurrentPlayers(
  pb: PocketBase,
): Promise<ExistingPlayer[]> {
  const records = await pb
    .collection("players")
    .getFullList<PlayerRecord>({ requestKey: null });

  return records.map((record) => ({
    id: record.id,
    name: record.name,
    name_normalized: record.name_normalized,
    club_code: record.club_code,
    club_name: record.club_name,
    position: record.position,
    status: record.status,
    // PocketBase stores unset text as "", and the pipeline's "no code" value is
    // null. Converting at the boundary is what keeps the diff's rules honest.
    person_code: record.person_code ? record.person_code : null,
    source: record.source,
    manual_lock: Boolean(record.manual_lock),
    dorsal: record.dorsal ?? "",
  }));
}

/** Which source may write right now. Defaults to `api` if the row is missing. */
export async function readRosterAuthority(
  pb: PocketBase,
): Promise<RosterAuthority> {
  const rows = await pb
    .collection("app_settings")
    .getFullList<{ roster_authority: RosterAuthority }>({ requestKey: null });
  return rows[0]?.roster_authority ?? "api";
}

export type ImportOutcome = {
  batchId: string;
  applied: boolean;
  authority: RosterAuthority;
  diff: RosterDiff;
  written: { added: number; changed: number; left: number };
  failures: string[];
};

/**
 * Run one import end to end: diff against the table, store the batch, and write
 * only if this source is the authority.
 *
 * The non-authoritative source is not refused — it runs and stores its diff
 * without applying it, which is the drift report decision D8 asks for.
 */
export async function runRosterImport({
  pb,
  incoming,
  source,
  season,
  problems = [],
  log = "",
}: {
  pb: PocketBase;
  incoming: NormalizedPlayer[];
  source: "api" | "csv";
  season: string;
  problems?: string[];
  log?: string;
}): Promise<ImportOutcome> {
  const authority = await readRosterAuthority(pb);
  const current = await readCurrentPlayers(pb);
  const diff = diffRosters({ current, incoming });
  diff.problems.push(...problems);

  const applied = source === authority;

  // Step 1: the audit record, before any player is touched.
  const batch = await pb.collection("roster_imports").create(
    {
      source,
      season,
      applied: false,
      rows: incoming.length,
      diff,
      log:
        log ||
        (applied
          ? `${source} holds authority: this batch will be applied.`
          : `${authority} holds authority, so this ${source} run is report-only.`),
    },
    { requestKey: null },
  );

  const written = { added: 0, changed: 0, left: 0 };
  const failures: string[] = [];

  if (applied) {
    // Step 2: the players. Independent writes; the indexes police collisions.
    for (const row of diff.adds) {
      try {
        await pb.collection("players").create(
          {
            ...row,
            // null is the pipeline's "no code"; PocketBase wants "".
            person_code: row.person_code ?? "",
            source,
            manual_lock: false,
          },
          { requestKey: null },
        );
        written.added += 1;
      } catch (error) {
        failures.push(`add ${row.name} (${row.club_code}): ${describe(error)}`);
      }
    }

    for (const change of diff.changes) {
      try {
        await pb
          .collection("players")
          .update(
            change.id,
            { ...change.fields, source },
            { requestKey: null },
          );
        written.changed += 1;
      } catch (error) {
        failures.push(`change ${change.name}: ${describe(error)}`);
      }
    }

    for (const gone of diff.leaving) {
      try {
        // Marked, never deleted: picks, cheat sheets, memberships and stats all
        // reference these ids.
        await pb
          .collection("players")
          .update(gone.id, { status: "left" }, { requestKey: null });
        written.left += 1;
      } catch (error) {
        failures.push(`mark left ${gone.name}: ${describe(error)}`);
      }
    }
  }

  // Step 3: the batch's verdict, last.
  const updated = await pb.collection("roster_imports").update(
    batch.id,
    {
      applied,
      log:
        `${source} → ${applied ? "applied" : "report-only"} (${authority} holds authority). ` +
        `${incoming.length} rows in: +${written.added} added, ~${written.changed} changed, ` +
        `${written.left} marked left, ${diff.blocked.length} blocked by a lock, ` +
        `${diff.problems.length} problems, ${failures.length} write failures.` +
        (failures.length ? `\n\n${failures.join("\n")}` : ""),
    },
    { requestKey: null },
  );

  return {
    batchId: updated.id,
    applied,
    authority,
    diff,
    written,
    failures,
  };
}

function describe(error: unknown): string {
  const response = (error as { response?: { message?: string } })?.response;
  return response?.message ?? (error as Error)?.message ?? String(error);
}
