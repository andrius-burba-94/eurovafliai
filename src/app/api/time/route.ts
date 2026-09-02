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
 * It sits behind the session like everything else (see `src/proxy.ts`) —
 * there is no reason for the open internet to ask this app what time it is —
 * and the client treats a failed fetch as "offset zero" rather than as an
 * error, because a countdown against the local clock is a far better
 * degradation than no countdown at all.
 */
export async function GET(): Promise<Response> {
  await connection();
  return Response.json(
    { now: Date.now() },
    { headers: { "cache-control": "no-store" } },
  );
}
