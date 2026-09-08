import { z } from "zod";

/**
 * Environment schemas and pure parsers.
 *
 * This file has no side effects and reads no globals — everything takes an
 * explicit source record so it can be unit-tested without touching
 * `process.env`. The thin caching wrappers live in `./public` and `./server`.
 */

export const publicEnvSchema = z.object({
  /**
   * Browser-facing PocketBase base URL. In production this is the Nginx-proxied
   * path (`https://eurovafliai.labrium.online/pb`) — never the internal port,
   * which is bound to 127.0.0.1 and unreachable from a browser.
   */
  NEXT_PUBLIC_PB_URL: z.url(),
  /**
   * The app's own browser-facing origin, used to build the OAuth2 redirect URI.
   *
   * In development this must be `http://localhost:3007`, NOT `127.0.0.1`: Google
   * treats the two as different redirect URIs and only the `localhost` form is
   * registered on the OAuth client. PocketBase URLs above are the opposite case.
   * See the gotcha list in AGENTS.md.
   */
  NEXT_PUBLIC_APP_URL: z.url(),
});

export const serverEnvSchema = z.object({
  /** Next server + worker talk to PocketBase directly over localhost. */
  PB_INTERNAL_URL: z.url(),
  PB_SUPERUSER_EMAIL: z.string().min(1),
  PB_SUPERUSER_PASSWORD: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default("eurovafliai_session"),
  /**
   * The Euroleague season the stats fetcher imports — slice 4.3.
   *
   * A variable rather than a constant because a season code is the one thing
   * about this app that is guaranteed to change, and changing it should not be
   * a deploy of new code. `E2026` is 2026-27.
   */
  EUROLEAGUE_SEASON: z
    .string()
    .regex(/^E\d{4}$/, "must look like E2026")
    .default("E2026"),
  /**
   * Whether the worker fetches box scores at all.
   *
   * Defaults **on**, because the whole point of 4.3 is that nobody has to
   * remember. It exists for two honest cases: a dev machine that should not
   * poll somebody else's API every quarter of an hour just because the worker
   * is running, and a night when the feed is misbehaving and the right move is
   * to stop asking rather than to stop the worker — which also enforces pick
   * deadlines.
   */
  STATS_FETCH: z.enum(["on", "off"]).default("on"),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

/**
 * Parse and fail loudly, naming every missing variable at once. Values are
 * never echoed — the message lists keys only, so a bad secret cannot leak into
 * logs or a CI transcript.
 */
function parse<T>(schema: z.ZodType<T>, source: unknown, label: string): T {
  const result = schema.safeParse(source);
  if (result.success) return result.data;

  const problems = result.error.issues
    .map((issue) => `  ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new Error(
    `Invalid ${label} environment. Fix these and restart (see .env.example):\n${problems}`,
  );
}

export function parsePublicEnv(source: unknown): PublicEnv {
  return parse(publicEnvSchema, source, "public");
}

export function parseServerEnv(source: unknown): ServerEnv {
  return parse(serverEnvSchema, source, "server");
}
