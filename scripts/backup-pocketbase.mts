import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema";

const KEEP = 14;
const env = parseServerEnv(process.env);
const pb = new PocketBase(env.PB_INTERNAL_URL);

await pb
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const stamp = new Date().toISOString().replaceAll(":", "-").replace(/\.\d{3}Z$/, "Z");
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
