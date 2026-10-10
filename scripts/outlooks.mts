/**
 * Compute and store every player's outlook now — slice 7.2 E.
 *
 *   npm run scout:outlooks
 *
 * The worker does this every fifteen minutes; this runs the same
 * `refreshOutlooks`, for a check after a deploy or on a fresh database. Safe
 * beside the worker: it writes only the rows that changed.
 *
 * Plain Node, so it builds its own PocketBase client from `parseServerEnv`
 * rather than importing `src/lib/pb/superuser` (which pulls in `server-only`).
 */
import PocketBase from "pocketbase";

import { refreshOutlooks } from "../src/lib/advisor/store";
import { parseServerEnv } from "../src/lib/config/schema";

const env = parseServerEnv(process.env);
const pb = new PocketBase(env.PB_INTERNAL_URL);
await pb.collection("_superusers").authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const report = await refreshOutlooks(pb, { season: env.EUROLEAGUE_SEASON, now: new Date() });
console.log(
  `outlooks · ${env.EUROLEAGUE_SEASON} · ${report.rulesets.join(", ") || "no league in season"} · ${report.written} written · ${report.unchanged} unchanged`,
);
