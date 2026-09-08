/**
 * Import box scores from the Euroleague API by hand — one pass, now.
 *
 *   npm run stats:sync                  # one pass, up to 12 games
 *   npm run stats:sync -- --all         # keep passing until nothing is outstanding
 *   npm run stats:sync -- --season=E2025 --max=3
 *
 * The worker does this every fifteen minutes on its own (slice 4.3), and this
 * script runs **the same `ingestFinishedGames`** — not a second
 * implementation. It exists for the two cases a timer is bad at: backfilling a
 * season on demand, and checking after a deploy that the box can actually
 * reach the feed and write what it reads.
 *
 * Safe to run at any time, including while the worker is running: the pass is
 * idempotent by unique index, so the worst two passes racing can do is have
 * one of them report rows the other created.
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`
 * rather than importing `src/lib/pb/superuser` — that module pulls in
 * `server-only`, which throws outside a React Server Component graph
 * (AGENTS.md).
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { ingestFinishedGames, summariseIngest } from "../src/lib/stats/ingest";

const env = parseServerEnv(process.env);
const arg = (name: string) =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.split("=")[1];

const season = arg("season") ?? env.EUROLEAGUE_SEASON;
const max = Number(arg("max") ?? 12);
const keepGoing = process.argv.includes("--all");

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

console.log(
  `Importing ${season} box scores · up to ${max} game(s) a pass${keepGoing ? " · until nothing is outstanding" : ""}`,
);

let passes = 0;
let created = 0;
let updated = 0;

for (;;) {
  passes += 1;
  const report = await ingestFinishedGames({
    pb,
    season,
    maxGames: max,
    log: (message) => console.log(`  … ${message}`),
  });

  console.log(`  ${summariseIngest(report)}`);
  for (const problem of report.problems) console.log(`  ! ${problem}`);

  created += report.created;
  updated += report.updated;

  // Stop on "nothing outstanding" *or* on "a pass that stored nothing", so a
  // game the feed keeps refusing cannot make `--all` loop for ever.
  const stuck = report.created + report.updated === 0;
  if (!keepGoing || report.outstanding <= report.attempted || stuck) {
    if (keepGoing && stuck && report.outstanding > report.attempted) {
      console.log(
        `\nStopping: a pass stored nothing while ${report.outstanding} game(s) are still outstanding. Read the problems above — the feed is refusing something rather than being slow.`,
      );
    }
    break;
  }
}

console.log(
  `\n${passes} pass(es) · ${created} game line(s) created · ${updated} corrected.`,
);
