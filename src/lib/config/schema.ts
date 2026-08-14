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
});

export const serverEnvSchema = z.object({
  /** Next server + worker talk to PocketBase directly over localhost. */
  PB_INTERNAL_URL: z.url(),
  PB_SUPERUSER_EMAIL: z.string().min(1),
  PB_SUPERUSER_PASSWORD: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  SESSION_COOKIE_NAME: z.string().min(1).default("eurovafliai_session"),
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
