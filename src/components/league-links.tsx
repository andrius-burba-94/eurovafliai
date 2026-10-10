"use client";

import { createContext, useContext, type ReactNode } from "react";

import type { LeagueSource } from "@/lib/positions";

const LeagueContext = createContext<{ base: string | null; source: LeagueSource }>({ base: null, source: "euroleague" });

/**
 * The league a page belongs to, for links deep inside it that are not handed
 * one: a player opened from the lineup, the panel, the pool or Stats stays
 * under /l/<league>/players/… and keeps the league's sidebar.
 */
export function LeagueLinksProvider({ base, source = "euroleague", children }: { base: string | null; source?: LeagueSource; children: ReactNode }) {
  return <LeagueContext.Provider value={{ base, source }}>{children}</LeagueContext.Provider>;
}

/** A player's page address: under the page's league when it has one. */
export function usePlayerHref(): (playerId: string) => string {
  const { base } = useContext(LeagueContext);
  return (playerId) => (base ? `${base}/players/${playerId}` : `/players/${playerId}`);
}

/** The game the page's league plays in: its scoring and its positions. */
export function useLeagueSource(): LeagueSource {
  return useContext(LeagueContext).source;
}
