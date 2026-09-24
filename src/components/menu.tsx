"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The shell's one dropdown — the league switcher, the account menu and the
 * phone's More sheet. ADR-0008, decision 8.
 *
 * A disclosure rather than an ARIA `menu`: what it opens is a list of links
 * and one sign-out form, and `role="menu"` would promise arrow-key roving and
 * menuitem semantics that a list of links does not need and a screen reader
 * would then announce wrongly. Tab walks it; Escape closes it and puts focus
 * back on the button; a click outside closes it; following a link closes it.
 *
 * The contents render only while open, so a closed menu contributes nothing to
 * the page — no second "Sign out" in the accessibility tree, no duplicate test
 * ids against the sidebar's copy of the same destinations.
 */
export function Menu({
  label,
  children,
  buttonClassName,
  panelClassName,
  testId,
}: {
  /** The button's content — its words, and optionally a drawn mark beside them. */
  label: ReactNode;
  children: ReactNode;
  buttonClassName: string;
  /** Where the panel sits. Written out by each caller; there is no default. */
  panelClassName: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      button.current?.focus();
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        data-testid={testId}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((current) => !current)}
        className={buttonClassName}
      >
        {label}
      </button>
      {open ? (
        <div
          id={panelId}
          data-testid={testId ? `${testId}-panel` : undefined}
          className={panelClassName}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest("a")) setOpen(false);
          }}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
