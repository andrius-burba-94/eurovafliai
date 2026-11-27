import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";

import { serverConfig } from "@/lib/config/server";
import { createUserClient } from "@/lib/pb/server";

/**
 * The session data layer.
 *
 * Next's own guidance for App Router auth: do optimistic checks in `proxy.ts`
 * (cookie presence only) and the authoritative check here, close to the data.
 * `src/proxy.ts` redirects anonymous traffic cheaply; this module is what
 * actually decides whether a request is authenticated.
 */

export type Session = {
  token: string;
  user: {
    id: string;
    email: string;
    name: string;
    avatar: string;
  };
};

/**
 * The signed-in user, or null.
 *
 * Wrapped in `React.cache`, so the PocketBase round-trip happens once per
 * request no matter how many components ask — the established pattern from the
 * sibling apps.
 *
 * It calls `authRefresh()` rather than trusting the cookie's contents: that is
 * what catches a token whose user has since been deleted, and it returns the
 * record so pages can render a name without a second fetch. The refreshed token
 * is deliberately discarded — cookies cannot be set during render, and the
 * cookie's own token stays valid until it expires anyway.
 *
 * The token comes from the session cookie (the browser) or, failing that, an
 * `Authorization: Bearer` header (the phone app, which has no cookie). Both are
 * the same PocketBase user token and get the same `authRefresh()`, so every
 * read that asks for the session serves `/api/v1` unchanged. A browser never
 * attaches a bearer header on its own, so accepting one opens no CSRF door.
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const cookieStore = await cookies();
  const token =
    cookieStore.get(serverConfig().SESSION_COOKIE_NAME)?.value ??
    bearerToken((await headers()).get("authorization"));
  if (!token) return null;

  const pb = createUserClient(token);
  if (!pb.authStore.isValid) return null; // expired; no point asking the server

  try {
    const { record } = await pb.collection("users").authRefresh();
    return {
      token,
      user: {
        id: record.id,
        email: record.email ?? "",
        name: record.name ?? "",
        avatar: record.avatar ?? "",
      },
    };
  } catch {
    // Rejected by the server: revoked, deleted, or a forged token.
    return null;
  }
});

/**
 * The same, but for code paths that cannot proceed without a user. Throws rather
 * than returning null so a missing null-check cannot silently leak data.
 */
export async function requireSession(): Promise<Session> {
  const session = await getSession();
  if (!session) throw new Error("Unauthorized: no valid session");
  return session;
}

/** The token in an `Authorization: Bearer <token>` header, or undefined. */
export function bearerToken(header: string | null): string | undefined {
  const match = /^Bearer\s+(\S+)$/i.exec(header?.trim() ?? "");
  return match?.[1];
}
