/**
 * Recompute last-5 and season averages onto `players` — slice 4.4.
 *
 *   npm run stats:project
 *
 * The worker and the CSV door already call `recomputeProjections` after an
 * ingest that wrote rows. This script is the repair: a crash between the box
 * scores landing and the player rows updating, or a local database that
 * imported E2025 before 4.4 existed.
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`
 * rather than importing `src/lib/pb/superuser` — that module pulls in
 * `server-only`.
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { isPastSeason } from "../src/lib/stats/seasons";
import { recomputeProjections } from "../src/lib/stats/store";

const env = parseServerEnv(process.env);
const season =
  process.argv.find((value) => value.startsWith("--season="))?.split("=")[1] ??
  env.EUROLEAGUE_SEASON;

// A cache of the season being played. Last season's lines are loaded mid-season
// for the scout (7.2 B); rebuilding from them would overwrite this season's.
if (isPastSeason(season, env.EUROLEAGUE_SEASON)) {
  console.error(
    `Refusing ${season}: pool averages describe EUROLEAGUE_SEASON (${env.EUROLEAGUE_SEASON}), and ${season} is before it. Set EUROLEAGUE_SEASON to rebuild a past season on a rehearsal database.`,
  );
  process.exit(1);
}

const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const report = await recomputeProjections(pb, season);
console.log(
  `projections · ${report.season} · ${report.updated} player(s) written · ${report.unchanged} already current · ${report.players} in the pool`,
);
