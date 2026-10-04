"use client";

import { createContext, useContext, type ReactNode } from "react";

const LeagueContext = createContext<{ base: string | null; basketNews: boolean }>({ base: null, basketNews: false });

/**
 * The league a page belongs to, for links deep inside it that are not handed
 * one: a player opened from the lineup, the panel, the pool or Stats stays
 * under /l/<league>/players/… and keeps the league's sidebar.
 */
export function LeagueLinksProvider({ base, basketNews = false, children }: { base: string | null; basketNews?: boolean; children: ReactNode }) {
  return <LeagueContext.Provider value={{ base, basketNews }}>{children}</LeagueContext.Provider>;
}

/** A player's page address: under the page's league when it has one. */
export function usePlayerHref(): (playerId: string) => string {
  const { base } = useContext(LeagueContext);
  return (playerId) => (base ? `${base}/players/${playerId}` : `/players/${playerId}`);
}

export function useBasketNewsLeague(): boolean {
  return useContext(LeagueContext).basketNews;
}
