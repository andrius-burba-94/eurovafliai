"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import type PocketBase from "pocketbase";

import { useLiveSubscription } from "@/lib/pb/use-live";

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

export function LiveDraft({
  draftId,
  authToken,
}: {
  draftId: string;
  authToken: string;
}) {
  const router = useRouter();
  const pending = useRef<ReturnType<typeof setTimeout> | null>(null);

  const rerender = useCallback(() => {
    if (pending.current) clearTimeout(pending.current);
    pending.current = setTimeout(() => {
      pending.current = null;
      router.refresh();
    }, COALESCE_MS);
  }, [router]);

  useEffect(
    () => () => {
      if (pending.current) clearTimeout(pending.current);
    },
    [],
  );

  const subscribe = useCallback(
    async (pb: PocketBase) => [
      await pb.collection("picks").subscribe("*", rerender, {
        // Single quotes: PocketBase rejects double-quoted filter values.
        filter: `draft = '${draftId}'`,
      }),
      // The record topic, not `*`: this is the only draft on screen, and a
      // sibling league's draft moving is none of this page's business.
      await pb.collection("drafts").subscribe(draftId, rerender),
    ],
    [draftId, rerender],
  );

  // On a *re*connect, re-render rather than trust the gap. On the first
  // connect nothing has been missed — the page was rendered a moment ago — so
  // spare it the round trip.
  const onConnect = useCallback(
    ({ reconnect }: { pb: PocketBase; reconnect: boolean }) => {
      if (reconnect) rerender();
    },
    [rerender],
  );

  const { connected } = useLiveSubscription({ authToken, subscribe, onConnect });

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
