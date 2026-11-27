import { APP_AUTH_REDIRECT } from "@eurovafliai/core/api/meta";

/**
 * Google's redirect for the phone app's sign-in, bounced into the app.
 *
 * Google accepts only https redirects on the Web client that PocketBase's
 * `google` provider holds, and a code must be redeemed with the redirect it was
 * issued for. So Google sends the code here, this page hands it to
 * `eurovafliai://auth`, and the app redeems it itself with
 * `authWithOAuth2Code` and the PKCE verifier only the app holds — which is why
 * an intercepted code is worthless and why this page keeps no state, reads no
 * cookie, exchanges nothing and logs nothing.
 *
 * The body is for a browser that does not follow a redirect to a custom
 * scheme: one link, the same address.
 */
export function GET(request: Request): Response {
  const query = new URL(request.url).searchParams;
  const forward = new URLSearchParams();
  const code = query.get("code");
  const state = query.get("state");

  if (query.get("error")) forward.set("error", "google_denied");
  else if (!code || !state) forward.set("error", "missing_code");
  else {
    forward.set("code", code);
    forward.set("state", state);
  }

  const target = `${APP_AUTH_REDIRECT}?${forward.toString()}`;
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width">` +
      `<title>Eurovafliai</title><a href="${target.replaceAll("&", "&amp;")}">Return to the app</a>`,
    {
      status: 302,
      headers: {
        Location: target,
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      },
    },
  );
}
