"use client";

import { useEffect, useRef, useState } from "react";

import { PositionPatch } from "@/components/board";
import { TeamCrest } from "@/components/broadcast";
import { CUE_KEY, PICK_STING, cuesEnabled } from "@/lib/cues/cues";
import type { Position } from "@/lib/engine";
import type { TeamStyle } from "@/lib/teams/identity";

export type LandedPick = {
  readonly overallNo: number;
  readonly round: number;
  readonly playerName: string;
  readonly position: Position;
  readonly memberName: string;
  readonly style?: TeamStyle;
  readonly isAuto: boolean;
};

const ON_AIR_MS = 2600;

function sting(context: AudioContext): void {
  const start = context.currentTime;
  PICK_STING.notes.forEach((frequency, index) => {
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.value = frequency;
    const at = start + index * PICK_STING.noteSeconds;
    gain.gain.setValueAtTime(0, at);
    gain.gain.linearRampToValueAtTime(PICK_STING.gain, at + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + PICK_STING.noteSeconds);
    oscillator.connect(gain).connect(context.destination);
    oscillator.start(at);
    oscillator.stop(at + PICK_STING.noteSeconds);
  });
}

/**
 * "The pick is in" — draft night's lower third (ADR-0011, moment six).
 *
 * The server re-renders the room on every pick; this remembers the latest
 * pick it has *seen* and plays only when a newer one arrives while the page is
 * open, so loading the room mid-draft is still. It wipes in across the bottom
 * of every screen for under three seconds, never takes a tap (the pool and the
 * Draft button stay usable underneath), and holds still under reduced motion.
 * The sting is the room's existing sound switch, not a new one.
 */
export function PickIsIn({ latest }: { latest: LandedPick | null }) {
  const seen = useRef(latest?.overallNo ?? 0);
  const audio = useRef<AudioContext | null>(null);
  const [shown, setShown] = useState<LandedPick | null>(null);

  useEffect(() => {
    // Browsers refuse a sound nobody asked for; the first tap in the room is
    // the permission, the same arrangement the clock cue has.
    const unlock = () => {
      if (!audio.current) {
        try {
          audio.current = new AudioContext();
        } catch {
          audio.current = null;
        }
      }
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  useEffect(() => {
    const previous = seen.current;
    // An undo lowers the count; following it down lets the replacement pick play.
    seen.current = latest?.overallNo ?? 0;
    if (!latest || latest.overallNo <= previous) return;
    let enabled = false;
    try {
      enabled = cuesEnabled(window.localStorage.getItem(CUE_KEY));
    } catch {
      enabled = false;
    }
    if (enabled && audio.current) sting(audio.current);
    const show = window.setTimeout(() => setShown(latest), 0);
    const hide = window.setTimeout(() => setShown(null), ON_AIR_MS);
    return () => {
      window.clearTimeout(show);
      window.clearTimeout(hide);
    };
  }, [latest]);

  if (!shown) return null;
  return (
    <div
      role="status"
      data-testid="pick-is-in"
      data-moment="lower-third"
      data-playing=""
      className="pointer-events-none fixed inset-x-3 bottom-[calc(var(--tabs-height)+0.75rem)] z-40 mx-auto flex max-w-xl overflow-hidden rounded-xl border border-panel-border bg-stock-panel lg:bottom-6"
    >
      <span className="display grid place-items-center bg-live px-3 text-lg text-live-ink">
        <span className="sr-only">Pick </span>
        {shown.overallNo}
      </span>
      <span data-moment-part="body" className="flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5">
        {shown.style ? <TeamCrest name={shown.memberName} color={shown.style.color} shape={shown.style.crest} size={34} /> : null}
        <span className="min-w-0">
          <span className="display block truncate text-xl leading-tight">{shown.playerName}</span>
          <span className="flex items-center gap-1.5 text-xs text-ink-soft">
            <PositionPatch position={shown.position} />
            to <span className="font-semibold text-ink">{shown.memberName}</span>
            {shown.isAuto ? " · autodraft" : ""}
          </span>
        </span>
      </span>
    </div>
  );
}
