/**
 * Sync the E2026 player pool from the Euroleague API.
 *
 * The summer-long default front door (blueprint 2.1, decision D8). Run it as
 * often as you like: the diff is computed against what is actually in the
 * table, so an unchanged roster writes nothing.
 *
 *   npm run rosters:sync              # apply if `api` holds authority
 *   npm run rosters:sync -- --dry-run # compute and print, store nothing
 *
 * It is a script rather than a web action on purpose. The roster is app-global
 * while the app's only role concept is per-league commissioner, so there is no
 * "who may sync" question to get wrong yet — running this needs the superuser
 * credentials from `.env`. The CSV front door does need that question answered,
 * which is why it is the next slice rather than this one.
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`
 * rather than importing `src/lib/pb/superuser` — that module pulls in
 * `server-only`, which throws outside a React Server Component graph
 * (AGENTS.md).
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { runRosterImport } from "../src/lib/rosters/apply";
import { fetchSeasonRosters } from "../src/lib/rosters/euroleague";

const dryRun = process.argv.includes("--dry-run");
const seasonArg = process.argv.find((arg) => arg.startsWith("--season="));
const season = seasonArg?.split("=")[1] ?? "E2026";

const env = parseServerEnv(process.env);

console.log(`Fetching ${season} rosters from the Euroleague API…`);
const { rows, problems, clubs, seasonName } = await fetchSeasonRosters({
  season,
  onProgress: (message) => console.log(`  … ${message}`),
});

console.log(
  `${clubs} clubs · ${rows.length} players` +
    (seasonName ? ` · the feed calls this season "${seasonName}"` : "") +
    (problems.length ? ` · ${problems.length} unreadable rows` : ""),
);
for (const problem of problems) console.log(`  ! ${problem}`);

const withoutCode = rows.filter((row) => !row.person_code).length;
if (withoutCode) {
  console.log(
    `${withoutCode} of ${rows.length} have no person code yet (${Math.round((withoutCode / rows.length) * 100)}%). ` +
      "Those match on normalized name + club until a later sync fills the code in.",
  );
}

if (rows.length === 0) {
  console.error("Refusing to continue: the API returned no players at all.");
  process.exit(1);
}

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

if (dryRun) {
  // Import the pure pieces directly so a dry run touches nothing at all.
  const { readCurrentPlayers, readRosterAuthority } =
    await import("../src/lib/rosters/apply");
  const { diffRosters } = await import("../src/lib/rosters/diff");
  const authority = await readRosterAuthority(pb);
  const current = await readCurrentPlayers(pb);
  const diff = diffRosters({ current, incoming: rows });
  report(authority, diff);
  console.log("\nDry run: nothing was written, and no batch was stored.");
  process.exit(0);
}

const outcome = await runRosterImport({
  pb,
  incoming: rows,
  source: "api",
  season,
  problems,
});

report(outcome.authority, outcome.diff);

console.log(
  `\nBatch ${outcome.batchId}: ${outcome.applied ? "applied" : "report-only"}.`,
);
if (outcome.applied) {
  console.log(
    `  +${outcome.written.added} added · ~${outcome.written.changed} changed · ${outcome.written.left} marked left`,
  );
} else {
  console.log(
    `  "${outcome.authority}" holds the roster authority, so this run only recorded what it would have changed.`,
  );
}
for (const failure of outcome.failures) console.log(`  ! ${failure}`);

// Non-zero for write failures AND for unreadable rows or refused matches: an
// unattended run that quietly ingested 321 of 324 players is the failure mode
// worth catching, and the reasons are on the stored batch either way.
const unclean = outcome.failures.length + outcome.diff.problems.length;
process.exit(unclean > 0 ? 1 : 0);

function report(
  authority: string,
  diff: Awaited<ReturnType<typeof runRosterImport>>["diff"],
): void {
  console.log(`\nAuthority: ${authority}`);
  console.log(
    `Plan: +${diff.adds.length} add · ~${diff.changes.length} change · ${diff.leaving.length} leaving · ` +
      `${diff.blocked.length} blocked by a lock · ${diff.problems.length} problems`,
  );
  for (const add of diff.adds.slice(0, 5)) {
    console.log(`  + ${add.name} (${add.club_code}, ${add.position})`);
  }
  if (diff.adds.length > 5)
    console.log(`  … ${diff.adds.length - 5} more adds`);
  for (const change of diff.changes.slice(0, 5)) {
    console.log(`  ~ ${change.name}: ${Object.keys(change.fields).join(", ")}`);
  }
  if (diff.changes.length > 5) {
    console.log(`  … ${diff.changes.length - 5} more changes`);
  }
  for (const gone of diff.leaving.slice(0, 10)) {
    console.log(`  − ${gone.name} (${gone.club_code}) → left`);
  }
  for (const blocked of diff.blocked) {
    console.log(`  🔒 ${blocked.name}: ${blocked.fields.join(", ")} (locked)`);
  }
  for (const problem of diff.problems) console.log(`  ! ${problem}`);
}
