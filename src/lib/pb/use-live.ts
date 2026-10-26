"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type PocketBase from "pocketbase";

import {
  attachSurface,
  browserPb,
  onAuthenticationLost,
  onConnectionLost,
} from "./browser";
import { refresher, type Refresher } from "./refresher";

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
 * How long to wait for the stream to come up before admitting we are deaf.
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
  /** True once this surface's own topics are subscribed — "are we listening yet". */
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
   * Runs each time the surface is listening again: once its topics are up,
   * and after every reconnect. Realtime does not replay, so whatever was
   * written before that moment — between the server render and the
   * subscription, or while a phone slept — reached nobody, and the surface
   * has to catch up by itself.
   */
  onConnect?: (pb: PocketBase) => void;
}): LiveSubscription {
  const router = useRouter();
  const [connected, setConnected] = useState(true);
  const [live, setLive] = useState(false);

  useEffect(() => {
    const grace = setTimeout(() => setConnected(false), CONNECT_GRACE_MS);
    const offLost = onConnectionLost(() => setConnected(false));
    const offAuth = onAuthenticationLost(() =>
      router.replace("/login?error=unauthorized"),
    );
    const pb = browserPb(authToken);
    const detach = attachSurface(pb, {
      subscribe,
      onUp: () => {
        clearTimeout(grace);
        setConnected(true);
        setLive(true);
        onConnect?.(pb);
      },
    });
    return () => {
      clearTimeout(grace);
      offLost();
      offAuth();
      detach();
    };
  }, [authToken, subscribe, onConnect, router]);

  return { connected, live };
}

/**
 * A `refresher` that holds while its tab is hidden. `run` must be
 * referentially stable (`useCallback`), as for `subscribe`.
 */
export function useRefresher(run: () => Promise<void> | void): Refresher {
  const gate = useMemo(() => refresher({ run, hidden: () => document.visibilityState === "hidden" }), [run]);
  useEffect(() => {
    const shown = () => document.visibilityState === "visible" && gate.shown();
    document.addEventListener("visibilitychange", shown);
    return () => {
      document.removeEventListener("visibilitychange", shown);
      gate.dispose();
    };
  }, [gate]);
  return gate;
}

export type LiveTopic = {
  collection: string;
  /** `*`, or one record's id. */
  topic: string;
  /** Single quotes: PocketBase rejects double-quoted filter values. */
  filter?: string;
};

/**
 * A server-rendered surface kept current: any event on `topics` re-renders
 * the route, and so does every (re)connect. The surface holds no state of its
 * own, so the server stays the only authority on what it shows.
 */
export function useLiveRefresh({ authToken, topics }: { authToken: string; topics: readonly LiveTopic[] }): LiveSubscription {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const gate = useRefresher(useCallback(() => startRefresh(() => router.refresh()), [router]));
  useEffect(() => {
    if (!refreshing) gate.settled();
  }, [refreshing, gate]);

  // Keyed on content, so a caller can pass a fresh array every render.
  const key = JSON.stringify(topics);
  const subscribe = useCallback(
    (pb: PocketBase) =>
      Promise.all((JSON.parse(key) as LiveTopic[]).map(({ collection, topic, filter }) =>
        pb.collection(collection).subscribe(topic, gate.request, filter ? { filter } : undefined))),
    [key, gate],
  );
  return useLiveSubscription({ authToken, subscribe, onConnect: gate.request });
}
