import "server-only";

import { cache } from "react";
import type PocketBase from "pocketbase";

import { serverConfig } from "@/lib/config/server";
import { createPbClient } from "./server";

/**
 * The superuser client, used by server actions for writes.
 *
 * Every write in this app goes through a server action holding this client, and
 * reads go through the user's token instead — that split is what keeps
 * PocketBase's API rules meaningful as defense-in-depth rather than decoration
 * (see docs/adr/ADR-0002).
 *
 * Wrapped in `React.cache`, so the superuser authentication round-trip happens
 * once per request even when an action performs several writes.
 */
export const getSuperuserClient = cache(async (): Promise<PocketBase> => {
  const pb = createPbClient();
  const { PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD } = serverConfig();
  await pb
    .collection("_superusers")
    .authWithPassword(PB_SUPERUSER_EMAIL, PB_SUPERUSER_PASSWORD);
  return pb;
});
