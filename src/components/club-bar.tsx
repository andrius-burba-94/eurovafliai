"use client";

import { useEffect, useRef, useState } from "react";

import { Floating } from "@/components/floating";
import { clubColor } from "@/lib/clubs/colors";

export type ClubBarSegment = {
  readonly clubCode: string;
  readonly name: string;
  readonly percent: number;
  readonly label: string;
};

/**
 * A team's points cut by club, each segment in the club's colour. Pointing at
 * (or tapping) a segment lifts it and names the club and its share. The bar is
 * hidden from assistive tech: the list beside it says the same in words.
 */
export function ClubBar({ segments, testId }: { segments: readonly ClubBarSegment[]; testId?: string }) {
  const [active, setActive] = useState<string | null>(null);
  const anchor = useRef<HTMLSpanElement | null>(null);
  const bar = useRef<HTMLSpanElement>(null);
  const current = segments.find((segment) => segment.clubCode === active) ?? null;

  useEffect(() => {
    if (!active) return;
    const onPointer = (event: PointerEvent) => {
      if (!bar.current?.contains(event.target as Node)) setActive(null);
    };
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [active]);

  return (
    <>
      <span
        ref={bar}
        aria-hidden="true"
        data-testid={testId}
        className="club-bar flex h-2.5 gap-0.5 rounded-full bg-stock-high"
        onPointerLeave={(event) => {
          if (event.pointerType === "mouse") setActive(null);
        }}
      >
        {segments.map((segment) => (
          <span
            key={segment.clubCode}
            ref={segment.clubCode === active ? anchor : undefined}
            data-club-segment={segment.clubCode}
            data-active={segment.clubCode === active ? "" : undefined}
            className="h-full cursor-default rounded-block first:rounded-l-full"
            style={{ width: `${segment.percent}%`, background: clubColor(segment.clubCode) }}
            onPointerEnter={(event) => {
              if (event.pointerType === "mouse") setActive(segment.clubCode);
            }}
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse") setActive((was) => (was === segment.clubCode ? null : segment.clubCode));
            }}
          />
        ))}
      </span>
      {current ? (
        <Floating
          key={current.clubCode}
          anchor={anchor}
          shown
          align="center"
          testId={testId ? `${testId}-tip` : undefined}
          className="flex w-max items-baseline gap-2 rounded-lg border border-rule bg-stock-high px-2.5 py-1.5 text-xs text-ink"
        >
          <span className="font-semibold">{current.name}</span>
          <span className="stat font-bold">{current.label}</span>
        </Floating>
      ) : null}
    </>
  );
}
