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

type RoundFixture = {
  readonly game_code: number;
  readonly local_club: string;
  readonly road_club: string;
  readonly played?: boolean;
  readonly utc_date?: string;
};

/** What a player's round says right now, plain enough to cross to the browser. */
export type PlayerRound = {
  /** Fantasy points in tenths, before any role multiplier; null until a line exists. */
  readonly tenths: number | null;
  /** Null when the player's club has no game this round. */
  readonly state: GameState | null;
  readonly tipOff: string | null;
};

/**
 * One player's game in a round and what it has scored. The Live page and the
 * lineup court both read a player's number through this, so the two cannot
 * show different figures for the same night.
 */
export function playerRoundOf<F extends RoundFixture>(input: {
  readonly clubCode: string;
  readonly fixtures: readonly F[];
  readonly snapshots: ReadonlyMap<number, { readonly live: boolean; readonly checked_at: string }>;
  readonly tenths: number | null;
  readonly now: number;
}): PlayerRound & { readonly fixture: F | null } {
  const fixture = input.fixtures.find((game) => game.local_club === input.clubCode || game.road_club === input.clubCode) ?? null;
  if (!fixture) return { fixture, state: null, tenths: input.tenths, tipOff: null };
  const state = gameStateOf({ played: Boolean(fixture.played), snapshot: input.snapshots.get(fixture.game_code), now: input.now });
  return { fixture, state, tenths: input.tenths, tipOff: fixture.utc_date || null };
}

export type RoundPoints = {
  /** A figure is drawn large with its unit; a note is a quiet word in its place. */
  readonly kind: "figure" | "note";
  readonly text: string;
  readonly live: boolean;
  /** The whole state as a sentence, for a reader that cannot see the dot. */
  readonly spoken: string;
};

/**
 * The number a player's card shows for the round, counted at the role's
 * multiplier the way the Live page counts it. A game in play with no line yet
 * reads 0.0 rather than a dash, because in the feed's terms that is the score.
 */
export function roundPointsOf(round: PlayerRound | undefined, multiplier: number): RoundPoints {
  if (!round || round.state === null) return { kind: "note", text: "No game", live: false, spoken: "no game this round" };
  if (round.state === "scheduled") {
    const clock = formatClock(round.tipOff);
    return { kind: "note", text: clock ?? "Later", live: false, spoken: clock ? `plays at ${clock}` : "plays later" };
  }
  const live = round.state === "live" || round.state === "stale";
  if (round.tenths === null && !live) return { kind: "note", text: "DNP", live: false, spoken: "did not play" };
  const text = (((round.tenths ?? 0) * multiplier) / 10).toFixed(1);
  const when = live ? ", live" : round.state === "fulltime" ? ", full time" : "";
  return { kind: "figure", text, live, spoken: `${text} points${when}` };
}

/** `14 PTS · 5 REB · 3 AST · PIR 17 · 24:10`, or `DNP`. */
export function statLineOf(player: Pick<LivePlayer, "points" | "rebounds" | "assists" | "pir" | "minutes">): string {
  if (player.minutes === "DNP") return "DNP";
  const line = `${player.points} PTS · ${player.rebounds} REB · ${player.assists} AST · PIR ${player.pir}`;
  return player.minutes ? `${line} · ${player.minutes}` : line;
}
