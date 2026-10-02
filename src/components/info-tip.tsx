"use client";

import { useId, useRef, useState, type ReactNode } from "react";

const TIP_WIDTH = 256;

/**
 * A short explanation behind a small "i" (or behind `trigger`, as an honour's
 * name is): shown on hover, on keyboard focus and on tap, because a phone has
 * no hover and Safari does not focus a tapped button. Escape and blur close
 * it. It opens toward whichever side of the screen has room.
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
  const [alignEnd, setAlignEnd] = useState(false);
  const shown = open || hovered;

  const place = () => {
    const rect = button.current?.getBoundingClientRect();
    if (rect) setAlignEnd(rect.left + TIP_WIDTH > window.innerWidth - 12);
  };

  return (
    <span
      className="relative inline-flex align-middle"
      onPointerEnter={(event) => {
        if (event.pointerType !== "mouse") return;
        place();
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
        onClick={() => {
          place();
          setOpen((value) => !value);
        }}
        onFocus={(event) => {
          if (!event.currentTarget.matches(":focus-visible")) return;
          place();
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
      <span
        role="tooltip"
        id={tip}
        className={`absolute top-full z-30 mt-1.5 w-max max-w-64 rounded-lg border border-rule bg-stock-high px-3 py-2 text-left text-xs leading-snug font-normal tracking-normal text-ink normal-case motion-safe:transition-opacity ${
          alignEnd ? "right-0" : "left-0"
        } ${shown ? "visible opacity-100" : "pointer-events-none invisible opacity-0"}`}
      >
        {children}
      </span>
    </span>
  );
}
