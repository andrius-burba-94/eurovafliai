import PocketBase, { BaseAuthStore, ClientResponseError } from "pocketbase";

import { publicConfig } from "@/lib/config/public";

/**
 * **One PocketBase client per page**, shared by every live surface on it.
 *
 * Not a micro-optimisation. Until 3.5 there was only ever one realtime surface
 * on a page — the lobby's member list, or the draft room — and each created its
 * own client in its own effect. League chat made two, and two broke the first
 * one: `LiveDraft`'s `await pb.realtime.subscribe(...)` **never resolved and
 * never threw**, so the room silently stopped hearing picks and pauses
 * altogether. The regression 2.6 exists to prevent, reintroduced by adding a
 * second listener beside it.
 *
 * The cause is that each client opens its own `EventSource`, and a browser
 * allows only a handful of concurrent connections per origin — in dev, where
 * StrictMode mounts every effect twice, the budget is gone before the second
 * surface asks for it. The SDK is built for exactly this: **one connection
 * multiplexes many subscriptions**, which is what sharing the client gives.
 *
 * Two consequences a caller has to respect, and they are the whole reason this
 * module exists rather than a bare `new PocketBase()`:
 *
 * 1. **Never call `pb.realtime.unsubscribe()` on cleanup.** That closes the
 *    shared connection and deafens every other surface on the page. Unsubscribe
 *    only the topics you subscribed to, using the functions `subscribe`
 *    returned.
 * 2. **Never assign `pb.realtime.onDisconnect`.** It is a single slot, so the
 *    last component to mount would silently own it and the others would never
 *    learn the connection had dropped. Use `onConnectionLost` below, which owns
 *    that slot once and fans out.
 *
 * The auth store is in-memory. The default `LocalAuthStore` persists to one
 * `localStorage` key and reconnects realtime whenever it changes, so two
 * instances would also have fought over that — a second bug behind the first.
 */

let cached: { url: string; token: string; pb: PocketBase; stop: () => void } | null = null;
const lostListeners = new Set<() => void>();
const authLostListeners = new Set<() => void>();
const upListeners = new Set<() => void>();

export function browserPb(authToken: string): PocketBase {
  const url = publicConfig().NEXT_PUBLIC_PB_URL;
  if (cached && cached.url === url && cached.token === authToken) {
    return cached.pb;
  }
  cached?.stop();
  const pb = new PocketBase(url, new BaseAuthStore());
  pb.authStore.save(authToken, null);
  // `activeSubscriptions.length > 0` distinguishes a dropped connection from a
  // teardown we asked for — see the SDK's note on this hook.
  pb.realtime.onDisconnect = (activeSubscriptions) => {
    if (activeSubscriptions.length > 0) {
      for (const listener of lostListeners) listener();
    }
  };
  cached = { url, token: authToken, pb, stop: keepLinked(pb) };
  return pb;
}

/** Wait before the nth retry of a first connect: 1s, doubling, at most 30s. */
export const retryDelay = (attempt: number) => Math.min(1_000 * 2 ** attempt, 30_000);

/**
 * Hold the page's one `PB_CONNECT` subscription and fan each connect out to
 * `attachSurface`. Returns a stop that closes the stream.
 *
 * The SDK retries a dropped stream forever, but a *first* connect that fails
 * (a bad signal, its 15s timeout) never, and leaves the failed listener
 * registered: so it is cleared and retried here, with backoff and at once when
 * the phone is back online or the page is shown. A refused token is never
 * retried; an expired one goes to sign-in rather than to a stream whose read
 * rules now filter out every event.
 */
export function keepLinked(pb: PocketBase): () => void {
  let attempt = 0;
  let retry: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const connect = () => {
    clearTimeout(retry);
    retry = undefined;
    pb.realtime
      .subscribe("PB_CONNECT", () => {
        attempt = 0;
        for (const listener of upListeners) listener();
      })
      .catch(async (error: unknown) => {
        if (reportRealtimeError(error) === "auth" || stopped) return;
        await pb.realtime.unsubscribe("PB_CONNECT");
        if (!stopped) retry = setTimeout(connect, retryDelay(attempt++));
      });
  };
  const wake = () => {
    if (document.visibilityState === "hidden" || tokenExpired(pb)) return;
    if (retry !== undefined) connect();
  };

  connect();
  window.addEventListener("online", wake);
  document.addEventListener("visibilitychange", wake);
  return () => {
    stopped = true;
    clearTimeout(retry);
    window.removeEventListener("online", wake);
    document.removeEventListener("visibilitychange", wake);
    // A new token means a new client; nothing on the page reads this one now.
    void pb.realtime.unsubscribe();
  };
}

function tokenExpired(pb: PocketBase): boolean {
  if (pb.authStore.isValid) return false;
  for (const listener of authLostListeners) listener();
  return true;
}

/**
 * One live surface on the shared stream: opens its topics once the stream is
 * up, then calls `onUp` after every (re)connect, since nothing written before
 * that reached it. The first `onUp` waits for the surface's own topics, not
 * for `PB_CONNECT`, which fires before they are posted.
 */
export function attachSurface(
  pb: PocketBase,
  { subscribe, onUp }: { subscribe: (pb: PocketBase) => Promise<Array<() => void>>; onUp: () => void },
): () => void {
  let active = true;
  let opening: ReturnType<typeof subscribe> | null = null;

  const up = async () => {
    if (!active || tokenExpired(pb)) return;
    try {
      opening ??= subscribe(pb);
      await opening;
    } catch (error) {
      opening = null;
      if (active) reportRealtimeError(error);
      return;
    }
    if (active) onUp();
  };

  upListeners.add(up);
  // On a client-side navigation the old page's topics go and the new page's
  // arrive in one tick: the SDK stays connected, so no `PB_CONNECT` is coming.
  if (pb.realtime.isConnected) void up();
  return () => {
    active = false;
    upListeners.delete(up);
    // Our own topics only: `pb.realtime.unsubscribe()` would close the
    // shared connection and deafen every other live surface on the page.
    void opening?.then((offs) => offs.forEach((off) => off()), () => {});
  };
}

/** Learn that the shared connection dropped. Returns an unsubscribe. */
export function onConnectionLost(listener: () => void): () => void {
  lostListeners.add(listener);
  return () => lostListeners.delete(listener);
}

/** A refused subscription is terminal; retrying the same token cannot heal it. */
export function reportRealtimeError(error: unknown): "auth" | "transport" {
  const status =
    error instanceof ClientResponseError
      ? error.status
      : (error as { status?: unknown } | null)?.status;
  if (status === 401 || status === 403) {
    for (const listener of authLostListeners) listener();
    return "auth";
  }
  for (const listener of lostListeners) listener();
  return "transport";
}

/** Learn that PocketBase refused the token. Returns an unsubscribe. */
export function onAuthenticationLost(listener: () => void): () => void {
  authLostListeners.add(listener);
  return () => authLostListeners.delete(listener);
}
