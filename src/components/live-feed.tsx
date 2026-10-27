"use client";

import { useEffect, useState } from "react";

import { useLiveRefresh } from "@/lib/pb/use-live";
import { feedStatus } from "@/lib/live/status";

/**
 * The provisional feed's status line, and the reason a live page keeps up: a
 * new snapshot for the round refreshes the server render it sits in.
 */
export function LiveFeed({ authToken, season, round, checkedAt, final, hasGameWindow, gameTimes, hasPlayedGames, hasFullTime, testId = "matchday-feed-status" }: {
  testId?: string;
  authToken: string;
  season: string;
  round: number;
  checkedAt: readonly string[];
  final: boolean;
  hasGameWindow: boolean;
  gameTimes: readonly string[];
  hasPlayedGames: boolean;
  hasFullTime: boolean;
}) {
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const { connected, live } = useLiveRefresh({
    authToken,
    topics: [{ collection: "live_game_snapshots", topic: "*", filter: `season = '${season}' && round = ${round}` }],
  });
  const status = feedStatus({ final, connected, checkedAt, now, hasGameWindow, gameTimes, hasPlayedGames, hasFullTime });
  return (
    <p
      className={`text-xs ${status.alert ? "text-gold" : "text-ink-soft"}`}
      role="status"
      data-testid={testId}
      data-live={live && connected ? "true" : "false"}
    >
      {status.label}
    </p>
  );
}
