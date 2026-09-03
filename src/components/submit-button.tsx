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
}: {
  children: ReactNode;
  testId?: string;
  tone?: "ink" | "live";
  pendingLabel?: string;
  /**
   * A row's action rather than a surface's. Drops the full-width phone
   * treatment, because a list of 30 rows each with a full-width button is a
   * column of buttons with names above them rather than a pool of players.
   */
  compact?: boolean;
}) {
  const { pending } = useFormStatus();

  const tones = {
    ink: "border-ink/35 hover:border-ink/80 active:bg-ink/5",
    live: "border-live/60 text-live hover:border-live active:bg-live/8",
  };

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      data-testid={testId}
      data-pending={pending ? "true" : undefined}
      className={`${tones[tone]} min-h-11 border px-4 py-3 text-slot font-semibold uppercase tracking-[0.14em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live disabled:cursor-progress disabled:opacity-60 ${compact ? "" : "w-full sm:w-auto"}`}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
