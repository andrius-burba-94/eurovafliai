import Link from "next/link";
import type { ReactNode } from "react";

export type Chip = {
  readonly key: string;
  readonly href: string;
  readonly current: boolean;
  readonly children: ReactNode;
  /** The chip's name when its face is a crest or a short code. */
  readonly label?: string;
  readonly testId?: string;
  /** A square chip for a crest alone. */
  readonly square?: boolean;
};

/**
 * A row of filter chips that are links: the page works before JavaScript and
 * every filter is a URL to share. `wrap` lets a short, fixed set (a league's
 * teams) always fit; without it a long run (38 rounds) scrolls sideways.
 */
export function ChipNav({ label, chips, wrap = false, testId }: { label: string; chips: readonly Chip[]; wrap?: boolean; testId?: string }) {
  return (
    <nav aria-label={label} data-testid={testId} className={`-mx-1 flex gap-1.5 px-1 ${wrap ? "flex-wrap" : "overflow-x-auto pb-1"}`}>
      {chips.map((chip) => (
        <Link
          key={chip.key}
          href={chip.href}
          aria-current={chip.current ? "page" : undefined}
          aria-label={chip.label}
          title={chip.label}
          data-testid={chip.testId}
          className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live ${
            chip.square ? "p-1" : "px-3.5"
          } ${chip.current ? "border-ink bg-ink text-stock" : "border-rule text-ink-soft hover:border-ink-soft hover:text-ink"}`}
        >
          {chip.children}
        </Link>
      ))}
    </nav>
  );
}
