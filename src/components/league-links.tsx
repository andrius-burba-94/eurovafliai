"use client";

import { createContext, useContext, type ReactNode } from "react";

const LeagueBase = createContext<string | null>(null);

/**
 * The league a page belongs to, for links deep inside it that are not handed
 * one: a player opened from the lineup, the panel, the pool or Stats stays
 * under /l/<league>/players/… and keeps the league's sidebar.
 */
export function LeagueLinksProvider({ base, children }: { base: string | null; children: ReactNode }) {
  return <LeagueBase.Provider value={base}>{children}</LeagueBase.Provider>;
}

/** A player's page address: under the page's league when it has one. */
export function usePlayerHref(): (playerId: string) => string {
  const base = useContext(LeagueBase);
  return (playerId) => (base ? `${base}/players/${playerId}` : `/players/${playerId}`);
}
