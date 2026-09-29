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
  disabled = false,
}: {
  children: ReactNode;
  testId?: string;
  /**
   * `live` is the one act on a surface. `liveOnField` is that act sitting
   * *inside* a live row — the pool's armed pick. Marker now clears contrast on
   * `live-sunk`, but its two jobs remain semantic, so the border carries the
   * marker and the label stays ink. The act is struck in marker without making
   * every action word another clock signal.
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
  disabled?: boolean;
}) {
  const { pending } = useFormStatus();

  const tones = {
    ink: "border border-rule-strong text-ink hover:border-ink-soft active:bg-ink/5",
    live: "border border-live bg-live text-live-ink hover:brightness-110 active:brightness-95",
    liveOnField: "border-2 border-live text-ink active:bg-live/8",
  };

  return (
    <button
      type="submit"
      disabled={pending || disabled}
      aria-busy={pending}
      data-testid={testId}
      data-pending={pending ? "true" : undefined}
      data-tone={tone}
      // Thirty rows in the pool each said only "Pick", so a screen-reader
      // rotor read "Pick, Pick, Pick…" with the player's name in a sibling
      // span it had no way to connect.
      aria-label={ariaLabel}
      className={`${tones[tone]} min-h-11 rounded-lg px-4 py-2.5 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live disabled:cursor-not-allowed disabled:opacity-60 ${compact ? "" : "w-full sm:w-auto"}`}
    >
      {pending ? (pendingLabel ?? "Working…") : children}
    </button>
  );
}
