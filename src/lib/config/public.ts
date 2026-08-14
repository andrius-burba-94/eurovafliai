import { parsePublicEnv, type PublicEnv } from "./schema";

/**
 * Client-safe config. Contains no secrets and is safe to import from client
 * components.
 *
 * Gotcha: Next only inlines `NEXT_PUBLIC_*` values into the browser bundle when
 * `process.env.NEXT_PUBLIC_FOO` appears **literally** in the source. Handing
 * `process.env` wholesale to the parser would compile to `undefined` on the
 * client. Every key below must therefore be spelled out.
 */
let cached: PublicEnv | undefined;

export function publicConfig(): PublicEnv {
  cached ??= parsePublicEnv({
    NEXT_PUBLIC_PB_URL: process.env.NEXT_PUBLIC_PB_URL,
  });
  return cached;
}
