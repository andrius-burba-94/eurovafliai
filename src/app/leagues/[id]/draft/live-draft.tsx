"use client";

import { useRouter } from "next/navigation";
import PocketBase from "pocketbase";
import { useEffect, useState } from "react";

import { publicConfig } from "@/lib/config/public";

/**
 * The draft room, live — slice 3.2a.
 *
 * Until this landed, the room was rendered per request: a pick reached the rest
 * of the league on their *next load*, so the "X is on the clock" banner sat
 * there naming somebody who had already picked. The only thing that moved a
 * screen by itself was a deadline passing, because the countdown pulls the page
 * once it hits zero. Found the first time a real draft was run on two devices,
 * which is exactly what that rehearsal was for.
 *
 * ## Why this component re-renders on the server instead of patching state
 *
 * `LiveLobby` answers its own events: it re-reads `league_members` and rebuilds
 * the list in the browser. The room cannot do that, and must not. Whose turn it
 * is, which players are still legal for you, what your roster still needs — all
 * of it is decided by the engine on the server (invariant §1), and a browser
 * that recomputed any of it would be a second authority that can disagree.
 *
 * So this component holds no draft state at all. It subscribes, and on an event
 * asks Next to re-render the route: `getDraftView` runs again, the engine
 * decides again, and the client renders whatever came back. The cost is a round
 * trip; the gain is that there is exactly one place in this app that knows who
 * is on the clock.
 *
 * ## What it subscribes to
 *
 * Two topics, because a pick is two writes (ADR-0003): the `picks` collection
 * filtered to this draft — creates, and the deletes a rollback performs — and
 * the `drafts` record itself, which carries `status`, `current_pick` and
 * `deadline`. Subscribing to only one of them would miss a pause, or miss the
 * pick that the pause was called over.
 *
 * The viewer's own token, as a prop, exactly as the lobby does: PocketBase's
 * read rules then scope the subscription to leagues this member belongs to, so
 * the SSE stream is authorised by the same rules as the page.
 */

/**
 * A pick is two writes, so it arrives as two events. Coalescing them into one
 * re-render halves the round trips and stops the room flickering twice per pick.
 */
const COALESCE_MS = 250;

/**
 * How long to wait for the first `PB_CONNECT` before admitting we are deaf.
 *
 * The component opens claiming to be connected, because the server-rendered
 * room *was* current a moment ago and crying "reconnecting" on every page load
 * would train the room to ignore the word. But a subscription that never comes
 * up at all — a blocked SSE endpoint, a proxy that buffers it to death, a
 * captive-portal wifi — is the one case where silence is a lie: the room looks
 * live and hears nothing. The SDK does not reject `subscribe()` in that case;
 * it retries quietly. So the honest signal is the absence of a connect event.
 *
 * Five seconds, because a phone on a slow connection deserves more than one.
 */
const CONNECT_GRACE_MS = 5_000;

export function LiveDraft({
  draftId,
  leagueId,
  authToken,
}: {
  draftId: string;
  /** Only for the filter's sake — the subscription is scoped by PB's rules. */
  leagueId: string;
  authToken: string;
}) {
  const router = useRouter();
  // Starts true: the server-rendered room *was* current a moment ago, and
  // opening on "reconnecting" would cry wolf on every page load.
  const [connected, setConnected] = useState(true);

  useEffect(() => {
    const pb = new PocketBase(publicConfig().NEXT_PUBLIC_PB_URL);
    pb.authStore.save(authToken, null);

    let active = true;
    let everConnected = false;
    let pending: ReturnType<typeof setTimeout> | null = null;
    const unsubscribes: Array<() => void> = [];

    const grace = setTimeout(() => {
      if (active && !everConnected) setConnected(false);
    }, CONNECT_GRACE_MS);

    const rerender = () => {
      if (!active) return;
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        if (active) router.refresh();
      }, COALESCE_MS);
    };

    // `activeSubscriptions.length > 0` distinguishes a dropped connection from
    // our own teardown — see the SDK's note on this hook.
    pb.realtime.onDisconnect = (activeSubscriptions) => {
      if (active && activeSubscriptions.length > 0) setConnected(false);
    };

    void (async () => {
      try {
        unsubscribes.push(
          await pb.realtime.subscribe("PB_CONNECT", () => {
            if (!active) return;
            clearTimeout(grace);
            setConnected(true);
            // On a *re*connect, re-render rather than trust the gap: whatever
            // happened while the socket was down was never delivered to
            // anyone. On the first connect nothing has been missed — the page
            // was rendered a moment ago — so spare it the round trip.
            if (everConnected) rerender();
            everConnected = true;
          }),
        );
        unsubscribes.push(
          await pb.collection("picks").subscribe("*", rerender, {
            // Single quotes: PocketBase rejects double-quoted filter values.
            filter: `draft = '${draftId}'`,
          }),
        );
        // The record topic, not `*`: this is the only draft on screen, and a
        // sibling league's draft moving is none of this page's business.
        unsubscribes.push(
          await pb.collection("drafts").subscribe(draftId, rerender),
        );
      } catch {
        if (active) setConnected(false);
      }
    })();

    return () => {
      active = false;
      clearTimeout(grace);
      if (pending) clearTimeout(pending);
      for (const unsubscribe of unsubscribes) unsubscribe();
      void pb.realtime.unsubscribe();
    };
  }, [draftId, leagueId, authToken, router]);

  if (connected) return null;

  return (
    <p
      data-testid="draft-reconnecting"
      role="status"
      className="slot-label text-ink-soft"
    >
      Reconnecting — this board may be behind
    </p>
  );
}
