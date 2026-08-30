"use server";

import { redirect } from "next/navigation";

import { publicConfig } from "@/lib/config/public";
import { createPbClient } from "@/lib/pb/server";
import {
  clearSessionCookie,
  setHandshakeCookies,
} from "./cookies";
import { buildAuthorizeUrl, redirectUriFor } from "./oauth";

/**
 * Start the Google sign-in.
 *
 * This is the *manual* OAuth2 code flow: PocketBase mints the PKCE pair and the
 * CSRF state, we stash them in httpOnly cookies and send the browser to Google.
 * The token never touches browser storage — `/auth/callback` exchanges the code
 * server-side and writes an httpOnly session cookie.
 */
export async function startGoogleLogin(): Promise<never> {
  const pb = createPbClient();

  // PocketBase may simply be down — during a deploy, after a crash, or because
  // someone stopped it locally. Unhandled, that surfaced as a raw
  // ClientResponseError stack trace on the login page, which is no way to tell
  // somebody the server is having a moment.
  let methods;
  try {
    methods = await pb.collection("users").listAuthMethods({ requestKey: null });
  } catch (error) {
    console.error("[auth] could not reach PocketBase for auth methods", error);
    redirect("/login?error=server_unavailable");
  }

  const google = methods.oauth2.providers.find((p) => p.name === "google");
  if (!google) {
    // The provider is configured by a migration from GOOGLE_CLIENT_ID /
    // GOOGLE_CLIENT_SECRET. Absent means those were unset when it applied.
    redirect("/login?error=provider_unavailable");
  }

  await setHandshakeCookies(google.state, google.codeVerifier);

  const redirectUri = redirectUriFor(publicConfig().NEXT_PUBLIC_APP_URL);
  redirect(buildAuthorizeUrl(google.authURL, redirectUri));
}

/**
 * Sign out: drop the session cookie and go back to the login page.
 *
 * The PocketBase token is not revoked server-side — PocketBase has no token
 * revocation list, tokens simply expire. Dropping the httpOnly cookie is the
 * whole logout, because the browser never had the token any other way.
 */
export async function logout(): Promise<never> {
  await clearSessionCookie();
  redirect("/login");
}
