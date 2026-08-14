import "server-only";

import { parseServerEnv, type ServerEnv } from "./schema";

/**
 * Server-only config: PocketBase superuser credentials, Google OAuth secrets,
 * session cookie name. The `server-only` import makes an accidental client
 * import a build error rather than a leak.
 *
 * Validation is lazy and cached, not module-load-time, so `next build` and CI
 * (which have no real secrets) never fail on a page that doesn't need them.
 */
let cached: ServerEnv | undefined;

export function serverConfig(): ServerEnv {
  cached ??= parseServerEnv(process.env);
  return cached;
}
