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

let cached: { url: string; token: string; pb: PocketBase } | null = null;
const lostListeners = new Set<() => void>();
const authLostListeners = new Set<() => void>();

export function browserPb(authToken: string): PocketBase {
  const url = publicConfig().NEXT_PUBLIC_PB_URL;
  if (cached && cached.url === url && cached.token === authToken) {
    return cached.pb;
  }
  const pb = new PocketBase(url, new BaseAuthStore());
  pb.authStore.save(authToken, null);
  // `activeSubscriptions.length > 0` distinguishes a dropped connection from a
  // teardown we asked for — see the SDK's note on this hook.
  pb.realtime.onDisconnect = (activeSubscriptions) => {
    if (activeSubscriptions.length > 0) {
      for (const listener of lostListeners) listener();
    }
  };
  cached = { url, token: authToken, pb };
  return pb;
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
