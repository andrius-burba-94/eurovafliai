"use client";

import { useId, useState } from "react";

import { Glyph, type GlyphName } from "@/components/glyphs";
import { HONOUR_MEANING, type BadgeId } from "@/lib/season/badges";

/** The honours in the order they are shown: most flattering first. */
export const HONOURS: readonly {
  readonly id: BadgeId;
  readonly label: string;
  readonly glyph: GlyphName;
  readonly ink: string;
  readonly tone: string;
}[] = [
  { id: "on-fire", label: "On fire", glyph: "flame", ink: "text-live", tone: "border-live/50 bg-live-sunk" },
  { id: "crowned", label: "Crowned", glyph: "crown", ink: "text-gold", tone: "border-gold/50 bg-gold/10" },
  { id: "spoon-collector", label: "Spoon collector", glyph: "spoon", ink: "text-wood", tone: "border-wood/60 bg-wood/15" },
];

/**
 * An honour's glyph and name, with what it means on hover, keyboard focus and
 * tap. A phone has no hover and Safari does not focus a tapped button, so a
 * tap toggles it too.
 */
export function HonourChip({ id, title }: { id: BadgeId; title?: string }) {
  const tip = useId();
  const [open, setOpen] = useState(false);
  const honour = HONOURS.find((row) => row.id === id)!;
  return (
    <span className="group relative inline-flex" onMouseLeave={() => setOpen(false)}>
      <button
        type="button"
        aria-describedby={tip}
        aria-expanded={open}
        data-testid={`honour-chip-${id}`}
        onClick={() => setOpen((value) => !value)}
        onFocus={(event) => {
          if (event.currentTarget.matches(":focus-visible")) setOpen(true);
        }}
        onBlur={() => setOpen(false)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setOpen(false);
        }}
        className="inline-flex min-h-8 items-center gap-1.5 rounded-full font-bold underline decoration-dotted decoration-ink-faint underline-offset-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
      >
        <Glyph name={honour.glyph} size={14} className={honour.ink} />
        {title ?? honour.label}
      </button>
      <span
        role="tooltip"
        id={tip}
        className={`absolute top-full left-0 z-20 mt-1 w-56 rounded-lg border border-panel-border bg-stock-panel px-3 py-2 text-xs font-normal text-ink motion-safe:transition-opacity ${
          open ? "visible opacity-100" : "invisible opacity-0 group-hover:visible group-hover:opacity-100"
        }`}
      >
        {HONOUR_MEANING[id]}
      </span>
    </span>
  );
}
