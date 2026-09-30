"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type PocketBase from "pocketbase";

import { useLiveSubscription } from "@/lib/pb/use-live";
import { feedStatus } from "@/lib/live/status";

const COALESCE_MS = 250;

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
  const [subscribed, setSubscribed] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlight = useRef(false);
  const dirty = useRef(false);
  const run = useCallback(() => {
    inFlight.current = true;
    startRefresh(() => router.refresh());
  }, [router]);
  useEffect(() => {
    if (refreshing) return;
    inFlight.current = false;
    if (dirty.current) {
      dirty.current = false;
      run();
    }
  }, [refreshing, run]);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);
  // A refresh asked for while another is in flight is otherwise lost, and the
  // last game's final whistle may be the last event of the night to heal it.
  const refresh = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      if (inFlight.current) dirty.current = true;
      else run();
    }, COALESCE_MS);
  }, [run]);
  const subscribe = useCallback(async (pb: PocketBase) => {
    const unsubscribe = await pb.collection("live_game_snapshots").subscribe("*", refresh, {
      filter: `season = '${season}' && round = ${round}`,
    });
    setSubscribed(true);
    return [unsubscribe];
  }, [season, round, refresh]);
  const onConnect = useCallback(({ reconnect }: { pb: PocketBase; reconnect: boolean }) => {
    if (reconnect) refresh();
  }, [refresh]);
  const { connected } = useLiveSubscription({ authToken, subscribe, onConnect });
  const status = feedStatus({ final, connected, checkedAt, now, hasGameWindow, gameTimes, hasPlayedGames, hasFullTime });
  return (
    <p
      className={`text-xs ${status.alert ? "text-gold" : "text-ink-soft"}`}
      role="status"
      data-testid="matchday-feed-status"
      data-live={subscribed && connected ? "true" : "false"}
    >
      {status.label}
    </p>
  );
}
