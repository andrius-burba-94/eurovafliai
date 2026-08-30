import "server-only";

import { cookies } from "next/headers";

import { publicConfig } from "@/lib/config/public";
import { serverConfig } from "@/lib/config/server";
import { cookieMaxAgeFromToken } from "./oauth";

/**
 * Cookie plumbing for the auth flow. Cookies can only be written from a Server
 * Action or a Route Handler, so everything here is called from one of those.
 */

/** Carries the PKCE verifier and CSRF state across the trip to Google. */
export const OAUTH_STATE_COOKIE = "eurovafliai_oauth_state";
export const OAUTH_VERIFIER_COOKIE = "eurovafliai_oauth_verifier";

/** Ten minutes is generous for "click the button, pick an account". */
const OAUTH_HANDSHAKE_MAX_AGE = 600;

/** Fallback when a token carries no usable `exp`: shorter than PocketBase's default. */
const SESSION_FALLBACK_MAX_AGE = 60 * 60 * 24;

/**
 * `secure` cookies are dropped by browsers over plain HTTP, so it cannot simply
 * be hardcoded true — local development is HTTP. Derived from the app's own
 * origin, which means production (HTTPS) gets it automatically.
 */
function isSecureOrigin(): boolean {
  return publicConfig().NEXT_PUBLIC_APP_URL.startsWith("https://");
}

export async function setHandshakeCookies(
  state: string,
  codeVerifier: string,
): Promise<void> {
  const store = await cookies();
  // sameSite 'lax', not 'strict': the callback arrives as a top-level
  // navigation from accounts.google.com, and 'strict' would withhold these
  // cookies on exactly that request, breaking every login.
  const options = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: isSecureOrigin(),
    path: "/",
    maxAge: OAUTH_HANDSHAKE_MAX_AGE,
  };
  store.set(OAUTH_STATE_COOKIE, state, options);
  store.set(OAUTH_VERIFIER_COOKIE, codeVerifier, options);
}

export async function readHandshakeCookies(): Promise<{
  state: string | undefined;
  codeVerifier: string | undefined;
}> {
  const store = await cookies();
  return {
    state: store.get(OAUTH_STATE_COOKIE)?.value,
    codeVerifier: store.get(OAUTH_VERIFIER_COOKIE)?.value,
  };
}

export async function clearHandshakeCookies(): Promise<void> {
  const store = await cookies();
  store.delete(OAUTH_STATE_COOKIE);
  store.delete(OAUTH_VERIFIER_COOKIE);
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(serverConfig().SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: isSecureOrigin(),
    path: "/",
    // Expire the cookie with the token, so a stale cookie never looks like a
    // live session.
    maxAge: cookieMaxAgeFromToken(token) ?? SESSION_FALLBACK_MAX_AGE,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(serverConfig().SESSION_COOKIE_NAME);
}
