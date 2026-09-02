import { connection } from "next/server";

/**
 * The server's clock — the one number a browser is not allowed to guess.
 *
 * Invariant §4: never trust a client clock. Deadlines are absolute timestamps
 * the server wrote, and a phone whose clock is two minutes fast would render a
 * countdown that hits zero two minutes early — on draft night, in front of
 * everyone. So the draft room fetches this once when it mounts, works out its
 * own offset, and counts down against `clientNow + offset`.
 *
 * The countdown it feeds is **display only**. Expiry is executed by the PM2
 * worker's sweep and by nothing else, so this endpoint cannot be gamed into
 * taking somebody's turn: lying about the time to it changes a number on your
 * own screen and nothing in the database.
 *
 * `connection()` rather than a cache directive: it is the documented way to
 * tell Next that what follows is per-request. Route handlers are uncached by
 * default today, but this one is *only* correct at request time, and saying so
 * in the file is cheaper than discovering a prerendered timestamp later.
 *
 * `src/proxy.ts` keeps it off the open internet by requiring a session cookie,
 * and that is **all** it does: the proxy is optimistic by design, so a forged
 * or expired cookie reaches this handler. That is deliberate here and nowhere
 * else — this route returns a timestamp, not data, and making the draft room's
 * countdown depend on a PocketBase round trip would buy a real failure mode for
 * no secret. **Any route handler that returns something worth protecting must
 * call `getSession()` itself**; copying this file is not a licence to skip it.
 *
 * The client treats a failed fetch as "offset zero" rather than as an error,
 * because a countdown against the local clock is a far better degradation than
 * no countdown at all.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(
    { now: Date.now() },
    { headers: { "cache-control": "no-store" } },
  );
}
