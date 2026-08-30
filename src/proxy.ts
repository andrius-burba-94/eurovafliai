import { NextResponse, type NextRequest } from "next/server";

/**
 * Optimistic route protection.
 *
 * `middleware.ts` is deprecated in Next 16; this is the `proxy.ts` convention
 * that replaced it. Per Next's own auth guidance the check here is *optimistic*
 * — it reads the session cookie's presence and nothing more. It runs on every
 * request including prefetches, so it must not talk to PocketBase.
 *
 * The authoritative check lives in `getSession()` (src/lib/auth/session.ts),
 * which every protected page and action calls. A forged or expired cookie gets
 * past this file by design and is rejected there.
 */

// Read from the environment rather than importing the config module: proxy is
// invoked separately from render code and should not depend on shared modules.
// The fallback matches the schema default in src/lib/config/schema.ts.
const SESSION_COOKIE = process.env.SESSION_COOKIE_NAME ?? "eurovafliai_session";

/** Reachable without a session. Everything else needs one. */
const PUBLIC_PATHS = ["/login", "/auth"];

export default function proxy(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }

  if (!request.cookies.has(SESSION_COOKIE)) {
    const url = new URL("/login", request.url);
    url.searchParams.set("error", "unauthorized");
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals and static assets: they need no session and matching
  // them would cost a proxy invocation per asset.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
