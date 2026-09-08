/**
 * Recompute standings snapshots from complete-draft picks × stored box scores.
 *
 *   npm run standings:recompute
 *   npm run standings:recompute -- --season=E2025
 *
 * The worker and the CSV door already call `recomputeStandings` after an
 * ingest that wrote rows. This script is the repair: a crash between the box
 * scores landing and the snapshots updating, or a local database that imported
 * a round before 4.5 existed.
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`
 * rather than importing `src/lib/pb/superuser` — that module pulls in
 * `server-only`.
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { recomputeStandings } from "../src/lib/stats/standings-store";

const env = parseServerEnv(process.env);
const season =
  process.argv.find((value) => value.startsWith("--season="))?.split("=")[1] ??
  env.EUROLEAGUE_SEASON;

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const report = await recomputeStandings(pb, season);
console.log(
  `standings · ${report.season} · ${report.leagues} league(s) · ${report.written} snapshot(s) written · ${report.unchanged} already current`,
);
