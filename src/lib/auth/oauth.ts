import { timingSafeEqual } from "node:crypto";

/**
 * Pure helpers for the Google OAuth2 manual code flow. No I/O, no cookies, no
 * PocketBase — so the fiddly, security-relevant parts are unit-testable.
 */

/** Where Google sends the browser back. Must match a URI registered on the client. */
export function redirectUriFor(appOrigin: string): string {
  return `${appOrigin.replace(/\/+$/, "")}/auth/callback`;
}

/**
 * PocketBase hands back an `authURL` that already carries `client_id`, `scope`,
 * `state` and the PKCE challenge, and ends with a bare `redirect_uri=` for the
 * caller to complete. Appending the encoded URI is the whole job — but the
 * trailing `redirect_uri=` is easy to double up or forget, hence a function with
 * a test rather than string concatenation at the call site.
 */
export function buildAuthorizeUrl(authURL: string, redirectUri: string): string {
  if (!authURL.endsWith("redirect_uri=")) {
    throw new Error(
      "Unexpected authURL from PocketBase: it should end with 'redirect_uri='. " +
        "Appending blindly would produce a malformed authorize URL.",
    );
  }
  return authURL + encodeURIComponent(redirectUri);
}

/**
 * Compare the `state` Google echoed back with the one we stored, in constant
 * time. A mismatch means the callback was not initiated by us — the CSRF check
 * that makes the flow safe.
 */
export function statesMatch(
  expected: string | undefined,
  received: string | undefined,
): boolean {
  if (!expected || !received) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  // timingSafeEqual throws on length mismatch, and length is not a secret.
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/**
 * Read a JWT's `exp` and turn it into a cookie `maxAge` in seconds, so the
 * session cookie expires exactly when its token does instead of lingering as a
 * cookie that looks like a session but cannot authenticate.
 *
 * Returns null when the token has no usable `exp`, letting the caller fall back
 * to a conservative default rather than trusting a parse.
 */
export function cookieMaxAgeFromToken(
  token: string,
  nowMs: number = Date.now(),
): number | null {
  const payload = token.split(".")[1];
  if (!payload) return null;

  let decoded: unknown;
  try {
    decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (
    typeof decoded !== "object" ||
    decoded === null ||
    !("exp" in decoded) ||
    typeof (decoded as { exp: unknown }).exp !== "number"
  ) {
    return null;
  }

  const seconds = Math.floor(
    (decoded as { exp: number }).exp - Math.floor(nowMs / 1000),
  );
  return seconds > 0 ? seconds : null;
}
