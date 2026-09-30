"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

export type MomentKind = "overtake" | "crown" | "sweep" | "stamp" | "spoon" | "badge" | "lower-third";

const SEEN_KEY = "eurovafliai:moments";
const MAX_REMEMBERED = 200;

function seen(): string[] {
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

function remember(id: string) {
  try {
    const next = [...seen().filter((item) => item !== id), id].slice(-MAX_REMEMBERED);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(next));
  } catch {
    // Private mode or a full quota: the moment simply plays again next time.
  }
}

/**
 * A celebration that plays once per viewer (ADR-0011).
 *
 * The server renders the end state and never the motion, so a first paint is
 * still and a page without JavaScript is complete. On mount the client asks
 * whether this viewer has already seen `id` — a round's crown, a climb to a
 * rank — and only then sets `data-playing`. Keying on what changed rather than
 * on the page means a reload is still and the next change plays again.
 */
export function Moment({
  kind,
  id,
  children,
  as = "div",
  className = "",
  testId,
  role,
  style,
  playing: playable = true,
}: {
  kind: MomentKind;
  /** What changed, stable across loads: "crown:league:3", "overtake:league:3:1". */
  id: string;
  children: ReactNode;
  as?: "div" | "span" | "li" | "tr";
  className?: string;
  testId?: string;
  role?: string;
  style?: CSSProperties;
  /** False renders the element still, for a row whose change did not happen. */
  playing?: boolean;
}) {
  const [playing, setPlaying] = useState(false);
  const done = useRef(false);

  useEffect(() => {
    if (done.current || !playable) return;
    done.current = true;
    if (seen().includes(id)) return;
    remember(id);
    // Deferred a frame so the still first paint lands before the motion starts.
    const frame = window.requestAnimationFrame(() => setPlaying(true));
    return () => window.cancelAnimationFrame(frame);
  }, [id, playable]);

  const Tag = as;
  return (
    <Tag
      data-moment={playable ? kind : undefined}
      data-playing={playing ? "" : undefined}
      data-testid={testId}
      className={className}
      role={role}
      style={style}
    >
      {children}
    </Tag>
  );
}
