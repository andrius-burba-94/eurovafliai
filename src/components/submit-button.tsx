"use client";

import type { ReactNode } from "react";
import { useFormStatus } from "react-dom";

/**
 * The board's action, with the pending state a server action needs.
 *
 * A client component for one reason: `useFormStatus`. Without it a tap on
 * "Create as commissioner" gives no feedback at all until the navigation lands,
 * and on this stack that gap is worse than it looks — React 19 clears
 * uncontrolled inputs across a server-action transition (see AGENTS.md), so a
 * slow create looks like the form silently emptied itself.
 *
 * 44px minimum height, because draft night is one-handed on a phone
 * (PRODUCT.md, Accessibility & Inclusion).
 */
export function SubmitButton({
  children,
  testId,
  tone = "ink",
  pendingLabel,
  compact = false,
  ariaLabel,
}: {
  children: ReactNode;
  testId?: string;
  /**
   * `live` is the one act on a surface. `liveOnField` is that act sitting
   * *inside* a live row — the pool's armed pick — where the marker's own red
   * cannot be the label: `live` text on `live-sunk` is 4.15:1 and DESIGN.md
   * forbids the pairing by name. So the border goes to full-strength marker
   * (4.15:1, which clears the 3:1 boundary floor) and the label goes to ink
   * (12.62:1). The act is still struck in marker; it is the *rule* that says
   * so, which is how this system says everything else.
   */
  tone?: "ink" | "live" | "liveOnField";
  pendingLabel?: string;
  /**
   * A row's action rather than a surface's. Drops the full-width phone
   * treatment, because a list of 30 rows each with a full-width button is a
   * column of buttons with names above them rather than a pool of players.
   */
  compact?: boolean;
  /** An accessible name, when the visible label is not distinguishing enough. */
  ariaLabel?: string;
}) {
  const { pending } = useFormStatus();

  const tones = {
    // `/50`, not `/35`: measured, `ink/35` over stock is **2.10:1** — under
    // this system's own 3:1 floor for a boundary that means something, and on
    // a button the border *is* the control: no fill, no radius, and in the pool
    // no coloured label either. Hover at `/80` was 7.72:1 and was the only
    // state that cleared the floor, which a phone never reaches. `/50` is
    // 3.10:1 and stays inside the 35–80% range DESIGN.md already declares.
    ink: "border-ink/50 hover:border-ink/80 active:bg-ink/5",
    live: "border-live/60 text-live hover:border-live active:bg-live/8",
    liveOnField: "border-2 border-live text-ink active:bg-live/8",
  };

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid={testId}
      data-pending={pending ? "true" : undefined}
      // Thirty rows in the pool each said only "Pick", so a screen-reader
      // rotor read "Pick, Pick, Pick…" with the player's name in a sibling
      // span it had no way to connect.
      aria-label={ariaLabel}
      className={`${tones[tone]} min-h-11 border px-4 py-3 text-slot font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live disabled:cursor-progress disabled:opacity-60 ${compact ? "" : "w-full sm:w-auto"}`}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
