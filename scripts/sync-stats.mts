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
 * A season other than `EUROLEAGUE_SEASON` is stored and nothing else: no pool
 * average and no standings table is rebuilt from it (7.2 B).
 */
import { ingestFinishedGames, summariseIngest } from "../src/lib/stats/ingest";
import { arg, env, flag, superuserFromEnv } from "./lib/pb.mjs";

const season = arg("season") ?? env.EUROLEAGUE_SEASON;
const max = Number(arg("max") ?? 12);
const keepGoing = flag("all");

const pb = await superuserFromEnv();

console.log(
  `Importing ${season} box scores · up to ${max} game(s) a pass${keepGoing ? " · until nothing is outstanding" : ""}`,
);
if (season !== env.EUROLEAGUE_SEASON) {
  console.log(`  ${env.EUROLEAGUE_SEASON} is the season being played: pool averages and standings stay as they are.`);
}

let passes = 0;
let created = 0;
let updated = 0;

for (;;) {
  passes += 1;
  const report = await ingestFinishedGames({
    pb,
    season,
    currentSeason: env.EUROLEAGUE_SEASON,
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
