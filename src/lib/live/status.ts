import { formatClock } from "@/lib/time/local";

import type { LivePlayer } from "./boxscore";

export type FeedStatus = { readonly label: string; readonly alert: boolean };

/** A displayed status must never imply finality from a provisional snapshot. */
export function feedStatus(input: {
  readonly final: boolean;
  readonly connected: boolean;
  readonly checkedAt: readonly string[];
  readonly now: number;
  readonly hasGameWindow: boolean;
  readonly gameTimes: readonly string[];
  readonly hasPlayedGames: boolean;
  readonly hasFullTime?: boolean;
}): FeedStatus {
  if (input.final) return { label: "Final scores recorded", alert: false };
  if (!input.connected) return { label: "Reconnecting to match updates", alert: true };
  const checks = input.checkedAt.map(Date.parse).filter(Number.isFinite);
  if (input.now > 0 && checks.some((checked) => input.now - checked > 5 * 60_000)) {
    return { label: "Live feed stale — scores may lag", alert: true };
  }
  if (checks.length > 0) {
    const latest = Math.max(...checks);
    return { label: `Provisional feed updated ${formatClock(latest)}`, alert: false };
  }
  if (input.hasFullTime) return { label: "Full time · waiting for the official box score", alert: false };
  const windowOpen = input.now > 0 ? input.gameTimes.some((stamp) => {
    const tip = Date.parse(stamp);
    return Number.isFinite(tip) && input.now >= tip - 5 * 60_000 && input.now < tip + 4 * 60 * 60_000;
  }) : input.hasGameWindow;
  return { label: windowOpen ? "Live data unavailable — showing the latest final scores" : input.hasPlayedGames ? "Some games finished · awaiting remaining results" : "Games have not started", alert: false };
}

export type GameState = "final" | "fulltime" | "live" | "stale" | "scheduled";

/**
 * `fulltime` is the gap between the live feed's last whistle and the official
 * box score being recorded: the figures are complete but still provisional.
 */
export function gameStateOf(input: {
  readonly played: boolean;
  readonly snapshot: { readonly live: boolean; readonly checked_at: string } | undefined;
  readonly now: number;
}): GameState {
  if (input.played) return "final";
  if (!input.snapshot) return "scheduled";
  if (!input.snapshot.live) return "fulltime";
  return input.now - Date.parse(input.snapshot.checked_at) > 5 * 60_000 ? "stale" : "live";
}

/** `14 PTS · 5 REB · 3 AST · PIR 17 · 24:10`, or `DNP`. */
export function statLineOf(player: Pick<LivePlayer, "points" | "rebounds" | "assists" | "pir" | "minutes">): string {
  if (player.minutes === "DNP") return "DNP";
  const line = `${player.points} PTS · ${player.rebounds} REB · ${player.assists} AST · PIR ${player.pir}`;
  return player.minutes ? `${line} · ${player.minutes}` : line;
}
