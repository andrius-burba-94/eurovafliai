import { NextResponse, type NextRequest } from "next/server";

import { publicConfig } from "@/lib/config/public";
import { createPbClient } from "@/lib/pb/server";
import {
  clearHandshakeCookies,
  readHandshakeCookies,
  setSessionCookie,
} from "@/lib/auth/cookies";
import { redirectUriFor, statesMatch } from "@/lib/auth/oauth";

/**
 * Google sends the browser here with `?code=…&state=…`.
 *
 * A Route Handler rather than a page, for two reasons: cookies can only be
 * written from a Server Action or a Route Handler, and there is nothing to
 * render — every path out of here is a redirect.
 *
 * The registered redirect URI is `http://localhost:3007/auth/callback` in
 * development. Note `localhost`: Google treats 127.0.0.1 as a different URI and
 * only this form is registered (see AGENTS.md).
 */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const appOrigin = publicConfig().NEXT_PUBLIC_APP_URL;
  const failTo = (reason: string) =>
    NextResponse.redirect(new URL(`/login?error=${reason}`, appOrigin));

  const params = request.nextUrl.searchParams;

  // Google reports user-side failures (a denied consent screen) in-band.
  if (params.get("error")) return failTo("google_denied");

  const code = params.get("code");
  const receivedState = params.get("state");
  if (!code || !receivedState) return failTo("missing_code");

  const { state: expectedState, codeVerifier } = await readHandshakeCookies();

  // The CSRF check. A mismatch means this callback was not started by us, so it
  // is never retried or "recovered from" — it is refused.
  if (!statesMatch(expectedState, receivedState)) {
    await clearHandshakeCookies();
    return failTo("state_mismatch");
  }
  if (!codeVerifier) {
    await clearHandshakeCookies();
    return failTo("handshake_expired");
  }

  const pb = createPbClient();
  try {
    const authData = await pb
      .collection("users")
      .authWithOAuth2Code("google", code, codeVerifier, redirectUriFor(appOrigin));

    await setSessionCookie(authData.token);
  } catch {
    // A bad code, a redirect_uri Google does not recognise, or PocketBase
    // refusing the record. Details are logged by PocketBase; the user gets a
    // generic failure rather than a leaked provider error.
    await clearHandshakeCookies();
    return failTo("exchange_failed");
  }

  await clearHandshakeCookies();
  return NextResponse.redirect(new URL("/", appOrigin));
}
