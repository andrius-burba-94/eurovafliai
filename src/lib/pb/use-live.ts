"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type PocketBase from "pocketbase";

import {
  browserPb,
  onAuthenticationLost,
  onConnectionLost,
  reportRealtimeError,
} from "./browser";

/**
 * One realtime subscription lifecycle, shared by every live surface.
 *
 * The lobby, the draft room and league chat each used to carry their own copy
 * of the same forty lines: take the shared client, register for connection
 * loss and token refusal, subscribe to `PB_CONNECT` and their own topics,
 * unsubscribe only those topics on teardown. Three copies drifted — chat had
 * no connect grace, the room and the lobby disagreed about what a reconnect
 * should do — and the realtime hardening had to be applied three times. This
 * is that lifecycle once; a surface supplies only the topics it cares about.
 *
 * `subscribe` receives the shared client and returns the unsubscribe functions
 * for the topics it opened. It must be referentially stable (`useCallback`) or
 * the subscription is torn down and reopened on every render.
 */

/**
 * How long to wait for the first `PB_CONNECT` before admitting we are deaf.
 *
 * A surface opens claiming to be connected, because the server render *was*
 * current a moment ago and crying "reconnecting" on every page load would
 * train the room to ignore the word. But a subscription that never comes up
 * at all — a blocked SSE endpoint, a proxy that buffers it to death, a
 * captive-portal wifi — is the one case where silence is a lie. The SDK does
 * not reject `subscribe()` then; it retries quietly. So the honest signal is
 * the absence of a connect event. Five seconds, because a phone on a slow
 * connection deserves more than one.
 */
const CONNECT_GRACE_MS = 5_000;

export type LiveSubscription = {
  /** False once the stream has dropped, or never came up within the grace. */
  connected: boolean;
  /** True from the first `PB_CONNECT` on — "are we subscribed yet". */
  live: boolean;
};

export function useLiveSubscription({
  authToken,
  subscribe,
  onConnect,
}: {
  authToken: string;
  subscribe: (pb: PocketBase) => Promise<Array<() => void>>;
  /**
   * Runs on every `PB_CONNECT`. `reconnect` is false for the first one — the
   * page was rendered a moment ago and has missed nothing — and true after a
   * drop, when whatever happened while the socket was down was never
   * delivered to anyone and the surface has to catch up by itself.
   */
  onConnect?: (info: { pb: PocketBase; reconnect: boolean }) => void;
}): LiveSubscription {
  const router = useRouter();
  const [connected, setConnected] = useState(true);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const pb = browserPb(authToken);

    let active = true;
    let everConnected = false;
    const unsubscribes: Array<() => void> = [];

    const grace = setTimeout(() => {
      if (active && !everConnected) setConnected(false);
    }, CONNECT_GRACE_MS);

    unsubscribes.push(
      onConnectionLost(() => {
        if (active) setConnected(false);
      }),
      onAuthenticationLost(() => {
        if (active) router.replace("/login?error=unauthorized");
      }),
    );

    void (async () => {
      try {
        unsubscribes.push(
          await pb.realtime.subscribe("PB_CONNECT", () => {
            if (!active) return;
            clearTimeout(grace);
            setConnected(true);
            setLive(true);
            onConnect?.({ pb, reconnect: everConnected });
            everConnected = true;
          }),
        );
        const own = await subscribe(pb);
        if (!active) {
          for (const unsubscribe of own) unsubscribe();
          return;
        }
        unsubscribes.push(...own);
      } catch (error) {
        if (active) reportRealtimeError(error);
      }
    })();

    return () => {
      active = false;
      clearTimeout(grace);
      // Our own topics only: `pb.realtime.unsubscribe()` would close the
      // shared connection and deafen every other live surface on the page.
      for (const unsubscribe of unsubscribes) unsubscribe();
    };
  }, [authToken, subscribe, onConnect, router]);

  return { connected, live };
}
