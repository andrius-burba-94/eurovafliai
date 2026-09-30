"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type PocketBase from "pocketbase";

import { useLiveSubscription } from "@/lib/pb/use-live";
import { feedStatus } from "@/lib/live/status";

export function MatchdayLive({ authToken, season, round, checkedAt, final, hasGameWindow, gameTimes, hasPlayedGames, hasFullTime }: {
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
  const router = useRouter();
  const [now, setNow] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, []);
  const refresh = useCallback(() => router.refresh(), [router]);
  const subscribe = useCallback(async (pb: PocketBase) => [
    await pb.collection("live_game_snapshots").subscribe("*", refresh, {
      filter: `season = '${season}' && round = ${round}`,
    }),
  ], [season, round, refresh]);
  const onConnect = useCallback(({ reconnect }: { pb: PocketBase; reconnect: boolean }) => {
    if (reconnect) router.refresh();
  }, [router]);
  const { connected } = useLiveSubscription({ authToken, subscribe, onConnect });
  const status = feedStatus({ final, connected, checkedAt, now, hasGameWindow, gameTimes, hasPlayedGames, hasFullTime });
  return <p className={`text-xs ${status.alert ? "text-gold" : "text-ink-soft"}`} role="status" data-testid="matchday-feed-status">{status.label}</p>;
}
