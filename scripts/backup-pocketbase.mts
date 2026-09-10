import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";

const KEEP = 14;
const env = parseServerEnv(process.env);
const pb = new PocketBase(env.PB_INTERNAL_URL);

await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

// PocketBase rejects uppercase letters in backup names (the ISO `T`/`Z`), so
// stamp as compact UTC digits only: eurovafliai-20260910T201526Z would fail.
const stamp = new Date()
  .toISOString()
  .replace(/[-:TZ.]/g, "")
  .slice(0, 14);
const key = `eurovafliai-${stamp}.zip`;

await pb.backups.create(key);

const backups = (await pb.backups.getFullList())
  .filter((backup) => backup.key.startsWith("eurovafliai-"))
  .sort((a, b) => b.modified.localeCompare(a.modified));

for (const backup of backups.slice(KEEP)) {
  await pb.backups.delete(backup.key);
}

console.log(
  JSON.stringify({
    time: new Date().toISOString(),
    level: "info",
    service: "eurovafliai-backup",
    message: `created ${key}; retained ${Math.min(backups.length, KEEP)} backup(s)`,
  }),
);
