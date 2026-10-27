/**
 * What every maintenance script starts with: the validated server env, a
 * superuser PocketBase client, and `--name=value` flags.
 *
 * Plain Node, so it builds its own client from `parseServerEnv` rather than
 * importing `src/lib/pb/superuser` — that module pulls in `server-only`, which
 * throws outside a React Server Component graph (AGENTS.md).
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../../src/lib/config/schema";

export const env = parseServerEnv(process.env);

export async function superuserFromEnv(): Promise<PocketBase> {
  const pb = new PocketBase(env.PB_INTERNAL_URL);
  await pb.collection("_superusers").authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);
  return pb;
}

/** `--name=value`; everything after the first `=` is the value. */
export const arg = (name: string): string | undefined =>
  process.argv.find((value) => value.startsWith(`--${name}=`))?.slice(name.length + 3);

export const flag = (name: string): boolean => process.argv.includes(`--${name}`);

/** The scripts that write fixtures or fake accounts refuse anything but this. */
export const isLocalPocketBase = (url: string): boolean =>
  /^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url);
