/**
 * Import last season's per-game averages onto `players` — slice 9.1.
 *
 *   npm run stats:prev                  # the season before EUROLEAGUE_SEASON
 *   npm run stats:prev -- --season=E2025
 *   npm run stats:prev -- --check       # compare against our backfill, write nothing
 *
 * This is the number a draft is decided on, because a draft happens before the
 * season it drafts for has a single game in it. `averagePirOf` falls back to
 * these columns for any player with no current-season games — which, on draft
 * night, is every player — so until this has run, the pool shows dashes and
 * autodraft falls all the way through to its alphabetical tiebreak.
 *
 * Run it once before the draft, and again if the roster sync adds players.
 *
 * The feed is the source and our own E2025 backfill is the cross-check; a
 * disagreement is printed, never reconciled, for the reason `applyPreviousSeason`
 * gives. `--check` runs the comparison and skips the writes.
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`
 * rather than importing `src/lib/pb/superuser` — that module pulls in
 * `server-only`.
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { fetchSeasonAverages } from "../src/lib/stats/euroleague";
import { previousSeasonOf } from "../src/lib/stats/seasons";
import { applyPreviousSeason } from "../src/lib/stats/store";

const env = parseServerEnv(process.env);
const checkOnly = process.argv.includes("--check");

/** The script refuses an unreadable code rather than guessing a year. */
function previousSeason(code: string): string {
  const previous = previousSeasonOf(code);
  if (!previous) {
    throw new Error(
      `Cannot work out the season before ${JSON.stringify(code)}. Pass --season=E2025 explicitly.`,
    );
  }
  return previous;
}

const season =
  process.argv.find((value) => value.startsWith("--season="))?.split("=")[1] ??
  previousSeason(env.EUROLEAGUE_SEASON);

console.log(`Reading ${season} from the official stats table…`);
const averages = await fetchSeasonAverages({
  season,
  onProgress: (message) => console.log(`  ${message}`),
});

if (averages.length === 0) {
  // A season with no games played answers `total: 0`. Not an error, and
  // retrying will not change it.
  console.error(
    `${season} has no player statistics yet. If that season has not tipped off, ask for the one before it.`,
  );
  process.exit(1);
}

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const report = await applyPreviousSeason(pb, season, averages, {
  dryRun: checkOnly,
});

console.log(
  `previous season · ${report.season} · ${report.fetched} in the feed · ${report.matched} matched · ${report.updated} ${
    checkOnly ? "would be written" : "written"
  } · ${report.unchanged} already current`,
);

if (report.unmatched.length > 0) {
  // Expected and not a failure: the feed lists everyone who played last
  // season, and most of them are not in this season's pool.
  console.log(
    `  ${report.unmatched.length} player(s) in the feed are not in our pool — last season's leavers.`,
  );
}

if (report.disagreements.length > 0) {
  console.error(
    `\n${report.disagreements.length} player(s) where the feed and our own backfill disagree:`,
  );
  for (const line of report.disagreements) console.error(`  ${line}`);
  console.error(
    "\nThe feed's number was stored. Resolve by hand before trusting either.",
  );
  process.exit(1);
}
