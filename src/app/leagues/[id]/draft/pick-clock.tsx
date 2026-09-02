"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { formatRemaining, millisRemaining } from "@/lib/drafts/due";

/**
 * The countdown — display only, and offset-corrected.
 *
 * Invariant §4, in a component: this clock never fires a pick. It reads the
 * absolute `deadline` the server wrote, corrects for the difference between
 * this device's clock and the server's, and shows the number. When it reaches
 * zero it says so; the pick is taken by the worker's sweep, a second later, or
 * not at all if the worker is down — in which case the draft simply waits,
 * which is the failure the invariants chose (§7).
 *
 * ## Why the offset
 *
 * A phone with a clock two minutes fast would count down to zero two minutes
 * early and tell its owner they had run out of time while everyone else's
 * screen still showed forty seconds. So the room asks `/api/time` once, halves
 * the round trip, and counts against `Date.now() + offset`. A failed fetch
 * leaves the offset at zero and the countdown running on the local clock: less
 * accurate, still useful, and never wrong about who picks.
 *
 * ## Why it pulls the page after zero
 *
 * The room is rendered per request — realtime is Phase 3.2 — so an autodraft
 * would otherwise be invisible until somebody reloaded. Past zero, and only
 * past zero, this asks the server for the page again: at 2s, then every 3s, up
 * to five times per deadline. If the sweep picked, the first pull brings in the
 * new deadline and the counter resets for the next member. If nothing comes
 * back — the worker is down — it stops after fifteen seconds rather than
 * polling all night, and the room's next reload or button press catches up.
 *
 * It is a refresh, not a decision: the server still owns every fact on screen,
 * and this component could be deleted without changing a single pick. Phase
 * 3.2's subscription replaces the whole mechanism.
 */

/** A quarter second. Cheap, and it keeps the first paint honest. */
const READ_EVERY_MS = 250;
/**
 * How long past zero to wait before the first pull — the sweep's own grace
 * period, plus a beat for it to write.
 */
const PULL_AFTER_MS = 2_000;
/** And how long between pulls after that. */
const PULL_EVERY_MS = 3_000;
/** Five, then give up: after fifteen seconds the worker is not coming. */
const MAX_PULLS = 5;

export function PickClock({ deadline }: { deadline: string }) {
  const router = useRouter();
  const [remaining, setRemaining] = useState<number | null>(null);
  /** Server clock minus this device's clock, in milliseconds. */
  const offset = useRef(0);
  /** How often this deadline has been pulled for, and when it last was. */
  const pulls = useRef({ deadline: "", count: 0, at: 0 });

  useEffect(() => {
    let cancelled = false;
    const sentAt = Date.now();
    fetch("/api/time", { cache: "no-store" })
      .then((response) => response.json())
      .then((body: { now?: number }) => {
        if (cancelled || typeof body.now !== "number") return;
        // Half the round trip is the standard guess at one-way latency. On a
        // LAN it is noise; on a phone on 4G it is worth having.
        const roundTrip = Date.now() - sentAt;
        offset.current = body.now + roundTrip / 2 - Date.now();
      })
      .catch(() => {
        // No offset, then. See the note above: the local clock still counts.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const read = () => {
      const left = millisRemaining(
        deadline,
        new Date(Date.now() + offset.current),
      );
      setRemaining(left);
      if (left === null || left > -PULL_AFTER_MS) return;

      // A new deadline means the draft moved on: start counting again.
      const state = pulls.current;
      if (state.deadline !== deadline) {
        pulls.current = { deadline, count: 0, at: 0 };
      }
      const at = Date.now();
      if (
        pulls.current.count < MAX_PULLS &&
        at - pulls.current.at >= PULL_EVERY_MS
      ) {
        pulls.current.count += 1;
        pulls.current.at = at;
        router.refresh();
      }
    };
    read();
    const timer = setInterval(read, READ_EVERY_MS);
    return () => clearInterval(timer);
  }, [deadline, router]);

  const expired = remaining !== null && remaining <= 0;

  return (
    <p
      // `role="timer"` without a live region: a number that announced itself
      // every second would make the room unusable with a screen reader on.
      role="timer"
      data-testid="pick-clock"
      className="mt-2 flex items-baseline gap-2"
    >
      <span className="slot-label">{expired ? "Time's up" : "Time left"}</span>
      <span className="text-2xl font-semibold tabular-nums">
        {/* Nothing on the first paint: the server has no business rendering a
            countdown, and a value it computed would be a hydration mismatch a
            quarter of a second before the real one arrived. */}
        {remaining === null ? "—" : formatRemaining(remaining)}
      </span>
    </p>
  );
}
