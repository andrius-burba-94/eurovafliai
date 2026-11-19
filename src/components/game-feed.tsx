"use client";

import { useEffect, useState } from "react";

import { useLiveRefresh } from "@/lib/pb/use-live";

/** A snapshot this old means the worker has stopped reading the game. */
const STALE_AFTER_MS = 5 * 60_000;

function ago(seconds: number): string {
  if (seconds < 60) return `${Math.max(0, Math.round(seconds))}s ago`;
  return `${Math.floor(seconds / 60)} min ago`;
}

/**
 * One game's feed line, and the reason the game page keeps up: a new snapshot
 * of this game, or the game being recorded, re-renders the page around it.
 */
export function GameFeed({
  authToken,
  season,
  gameCode,
  checkedAt,
  state,
  testId = "game-feed-status",
}: {
  authToken: string;
  season: string;
  gameCode: number;
  checkedAt: string | null;
  state: "final" | "fulltime" | "live" | "stale" | "scheduled";
  testId?: string;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    if (state === "final") return;
    const tick = () => setNow(Date.now());
    const first = setTimeout(tick, 0);
    const timer = setInterval(tick, 5_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [state]);
  const filter = `season = '${season}' && game_code = ${gameCode}`;
  const { connected, live } = useLiveRefresh({
    authToken,
    topics: [
      { collection: "live_game_snapshots", topic: "*", filter },
      { collection: "fixtures", topic: "*", filter },
    ],
  });

  const checked = Date.parse(checkedAt ?? "");
  const age = now > 0 && Number.isFinite(checked) ? (now - checked) / 1000 : null;
  const stale = age !== null && age * 1000 > STALE_AFTER_MS && (state === "live" || state === "stale");
  const label = state === "final"
    ? "Final · official box score"
    : !connected
      ? "Reconnecting to match updates"
      : stale
        ? "Live feed stale — figures may lag"
        : state === "fulltime"
          ? "Full time · waiting for the official box score"
          : state === "scheduled"
            ? "The box score fills in at tip-off"
            : age !== null
              ? `Provisional · updated ${ago(age)}`
              : "Provisional · live";
  return (
    <p
      role="status"
      data-testid={testId}
      data-live={live && connected ? "true" : "false"}
      className={`text-xs ${!connected || stale ? "text-gold" : "text-ink-soft"}`}
    >
      {label}
    </p>
  );
}
