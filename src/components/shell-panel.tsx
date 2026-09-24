"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

/**
 * The side panel's frame — ADR-0008, decision 3.
 *
 * Rendered once. From `xl` it is the shell's third column and always there;
 * below `xl` the same element becomes a full-height sheet the header opens.
 * Drawing it twice — a column and a sheet — would put two copies of its tabs
 * and its search box in the DOM, which is two of every id and two of every
 * test id.
 *
 * `docked={false}` keeps it a sheet at every width. The draft room asks for
 * that: its pool and board already split the content in two, and a third
 * column at 1280px would leave each of them a phone's width.
 *
 * The sheet is panel stock with a heavy rule and nothing else: no shadow, no
 * scrim and no blur, because the depth scale has none of the three.
 */

type PanelState = {
  open: boolean;
  setOpen: (open: boolean) => void;
  docked: boolean;
};

const PanelContext = createContext<PanelState | null>(null);

export function PanelProvider({
  docked = true,
  children,
}: {
  docked?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <PanelContext.Provider value={{ open, setOpen, docked }}>
      {children}
    </PanelContext.Provider>
  );
}

const usePanel = (): PanelState => {
  const state = useContext(PanelContext);
  if (!state) throw new Error("PanelToggle and PanelFrame need a PanelProvider");
  return state;
};

export function PanelToggle({ label }: { label: string }) {
  const { open, setOpen, docked } = usePanel();
  return (
    <button
      type="button"
      data-testid="panel-toggle"
      aria-expanded={open}
      aria-controls="context-panel"
      onClick={() => setOpen(!open)}
      className={`slot-label inline-flex min-h-11 min-w-11 items-center justify-center border border-ink/50 px-3 text-ink transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
        docked ? "xl:hidden" : ""
      }`}
    >
      {label}
    </button>
  );
}

const SHEET =
  "fixed inset-y-0 right-0 z-40 flex w-full border-rule-strong bg-stock-panel max-sm:border-t sm:w-[22rem] sm:border-l";
const COLUMN =
  "xl:sticky xl:top-0 xl:z-auto xl:flex xl:h-dvh xl:w-[22rem] xl:shrink-0 xl:border-t-0 xl:border-l xl:border-rail/40 xl:bg-stock xl:px-4 xl:pt-6";

export function PanelFrame({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  const { open, setOpen, docked } = usePanel();
  const close = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    close.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      document.querySelector<HTMLButtonElement>("[data-testid='panel-toggle']")?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, setOpen]);

  return (
    <aside
      id="context-panel"
      aria-label={label}
      data-testid="context-panel"
      data-open={open ? "true" : undefined}
      className={`${open ? SHEET : "hidden"} flex-col gap-4 overflow-y-auto px-5 pt-4 pb-8 ${
        docked ? COLUMN : ""
      }`}
    >
      <div
        className={`flex items-center justify-between gap-4 ${docked ? "xl:hidden" : ""}`}
      >
        <span className="slot-label text-ink">{label}</span>
        <button
          ref={close}
          type="button"
          onClick={() => setOpen(false)}
          className="slot-label inline-flex min-h-11 min-w-11 items-center justify-center px-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          Close
        </button>
      </div>
      {children}
    </aside>
  );
}
