/**
 * Recompute standings snapshots from complete-draft picks × stored box scores.
 *
 *   npm run standings:recompute
 *
 * The worker and the CSV door already call `recomputeStandings` after an
 * ingest that wrote rows. This script is the repair: a crash between the box
 * scores landing and the snapshots updating, or a local database that imported
 * a round before 4.5 existed.
 */
import { isPastSeason } from "../src/lib/stats/seasons";
import { recomputeStandings } from "../src/lib/stats/standings-store";
import { arg, env, superuserFromEnv } from "./lib/pb.mjs";

const season = arg("season") ?? env.EUROLEAGUE_SEASON;

// A cache of the season being played. Last season's lines are loaded mid-season
// for the scout (7.2 B); rebuilding from them would overwrite this season's.
if (isPastSeason(season, env.EUROLEAGUE_SEASON)) {
  console.error(
    `Refusing ${season}: standings describe EUROLEAGUE_SEASON (${env.EUROLEAGUE_SEASON}), and ${season} is before it. Set EUROLEAGUE_SEASON to rebuild a past season on a rehearsal database.`,
  );
  process.exit(1);
}

const pb = await superuserFromEnv();

const report = await recomputeStandings(pb, season);
console.log(
  `standings · ${report.season} · ${report.leagues} league(s) · ${report.written} snapshot(s) written · ${report.unchanged} already current`,
);
