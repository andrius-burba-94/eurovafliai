/**
 * Give every league, team and player without a slug one.
 *
 *   npm run slugs:backfill
 *
 * The worker does the same pass at boot and hourly; this is the manual path
 * right after the S28 migration, or on a database the worker has not seen.
 * Idempotent: a second run writes nothing.
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`
 * rather than importing `src/lib/pb/superuser` — that module pulls in
 * `server-only`.
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";
import { ensureSlugs } from "../src/lib/slugs/store";

const env = parseServerEnv(process.env);
const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb.collection("_superusers").authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const report = await ensureSlugs(pb);
console.log(`slugs · ${report.leagues} league(s) · ${report.teams} team(s) · ${report.players} player(s) · ${report.failed} refused`);
process.exit(report.failed > 0 ? 1 : 0);
