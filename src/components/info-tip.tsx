"use client";

import { useId, useRef, useState, type ReactNode } from "react";

import { Floating } from "@/components/floating";

/**
 * A short explanation behind a small "i" (or behind `trigger`, as an honour's
 * name is): shown on hover, on keyboard focus and on tap, because a phone has
 * no hover and Safari does not focus a tapped button. Escape and blur close
 * it. It floats over the page (`Floating`), so a clipped strip or panel cannot
 * hide it, and opens toward whichever side of the screen has room.
 */
export function InfoTip({
  children,
  label,
  trigger,
  triggerClassName,
  testId,
}: {
  /** What the tip says. One or two plain sentences. */
  children: ReactNode;
  /** The accessible name of the default "i" button, e.g. "About Captain regret". */
  label?: string;
  trigger?: ReactNode;
  triggerClassName?: string;
  testId?: string;
}) {
  const tip = useId();
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const shown = open || hovered;

  return (
    <span
      className="relative inline-flex align-middle"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        setHovered(true);
      }}
      onPointerLeave={() => {
        setHovered(false);
        setOpen(false);
      }}
    >
      <button
        ref={button}
        type="button"
        aria-label={trigger ? undefined : label}
        aria-describedby={tip}
        aria-expanded={shown}
        data-testid={testId}
        onClick={() => setOpen((value) => !value)}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
            setHovered(false);
          }
        }}
        className={
          trigger
            ? `${triggerClassName ?? ""} focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live`
            : "relative inline-grid size-[1.125rem] shrink-0 place-items-center rounded-full border border-rule text-[0.625rem] leading-none font-bold text-ink-faint normal-case transition-colors before:absolute before:-inset-3 before:content-[''] hover:border-ink-soft hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        }
      >
        {trigger ?? <span aria-hidden="true" className="font-mono">i</span>}
      </button>
      <Floating
        anchor={button}
        shown={shown}
        role="tooltip"
        id={tip}
        className="w-max max-w-64 rounded-lg border border-rule bg-stock-high px-3 py-2 text-left text-xs leading-snug font-normal tracking-normal text-ink normal-case motion-safe:transition-opacity"
      >
        {children}
      </Floating>
    </span>
  );
}
