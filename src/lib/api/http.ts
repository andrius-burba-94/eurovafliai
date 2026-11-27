import "server-only";

import { API_ERROR_STATUS, type ApiError } from "@eurovafliai/core/api/errors";

import { getSession, type Session } from "@/lib/auth/session";

/**
 * The request-facing half of `/api/v1`: session in, JSON out. Business rules
 * never live here; a route asks a framework-free function and reports what it
 * said, exactly as a server action does.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

export function ok<T>(body: T, status = 200): Response {
  return Response.json(body, { status, headers: NO_STORE });
}

export function refuse(error: ApiError): Response {
  return Response.json(error, { status: API_ERROR_STATUS[error.code], headers: NO_STORE });
}

/** Runs `handler` for a signed-in member, or answers 401 without calling it. */
export async function withSession(handler: (session: Session) => Promise<Response>): Promise<Response> {
  const session = await getSession();
  if (!session) return refuse({ code: "unauthenticated", message: "Sign in again." });
  return handler(session);
}
