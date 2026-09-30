import { formatClock } from "@/lib/time/local";

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
  const windowOpen = input.now > 0 ? input.gameTimes.some((stamp) => {
    const tip = Date.parse(stamp);
    return Number.isFinite(tip) && input.now >= tip - 5 * 60_000 && input.now < tip + 4 * 60 * 60_000;
  }) : input.hasGameWindow;
  return { label: windowOpen ? "Live data unavailable — showing the latest final scores" : input.hasPlayedGames ? "Some games finished · awaiting remaining results" : "Games have not started", alert: false };
}
