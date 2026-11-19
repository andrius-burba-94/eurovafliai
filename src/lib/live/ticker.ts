import { gameDayOf } from "@/lib/time/local";

import { clockLabel } from "./game-box";
import { gameStateOf, type GameState } from "./status";

/** The strip opens an hour before the day's first tip-off… */
const OPENS_BEFORE_FIRST_TIP_MS = 60 * 60_000;
/** …and closes once the day's last game has had time to finish. */
const CLOSES_AFTER_LAST_TIP_MS = 4 * 60 * 60_000;

export type TickerFixture = {
  readonly game_code: number;
  readonly local_club: string;
  readonly road_club: string;
  readonly played?: boolean;
  readonly local_score?: number;
  readonly road_score?: number;
  readonly utc_date?: string;
};

export type TickerSnapshot = {
  readonly game_code: number;
  readonly live: boolean;
  readonly checked_at: string;
  readonly localScore: number;
  readonly roadScore: number;
  readonly detail?: { readonly period: number | null; readonly clock: string | null };
};

/**
 * What the strip keeps of a stored snapshot — the score and the clock, not the
 * players — whether it came from the server read or a realtime event.
 */
export function tickerSnapshotOf(row: {
  readonly game_code: number;
  readonly live: boolean;
  readonly checked_at: string;
  readonly local_score?: number;
  readonly road_score?: number;
  readonly detail?: { readonly period?: number | null; readonly clock?: string | null } | null;
}): TickerSnapshot {
  return {
    game_code: row.game_code,
    live: row.live,
    checked_at: row.checked_at,
    localScore: row.local_score ?? 0,
    roadScore: row.road_score ?? 0,
    ...(row.detail ? { detail: { period: row.detail.period ?? null, clock: row.detail.clock ?? null } } : {}),
  };
}

/** The later of two readings of one game: realtime and a re-render can arrive in either order. */
export function newerSnapshot(a: TickerSnapshot | undefined, b: TickerSnapshot | undefined): TickerSnapshot | undefined {
  if (!a || !b) return a ?? b;
  return Date.parse(b.checked_at) > Date.parse(a.checked_at) ? b : a;
}

/** One game as the strip prints it. Plain, so it crosses to the browser. */
export type TickerGame = {
  readonly code: number;
  readonly home: string;
  readonly away: string;
  readonly state: GameState;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly tipOff: string | null;
  /** `Q3 · 4:12` while the feed has a clock. */
  readonly clock: string | null;
};

/**
 * The game day the strip covers: one league-time day's games, from an hour
 * before its first tip-off until its last game has had time to finish — which
 * can be after midnight. Empty on a day without games, so the strip is not
 * drawn at all.
 */
export function tickerFixtures<F extends TickerFixture>(fixtures: readonly F[], now: number): F[] {
  const days = new Map<string, F[]>();
  for (const game of fixtures) {
    const day = gameDayOf(game.utc_date);
    if (day) days.set(day, [...(days.get(day) ?? []), game]);
  }
  const open = [...days.entries()].filter(([, games]) => {
    const tips = games.map((game) => Date.parse(game.utc_date ?? ""));
    return now >= Math.min(...tips) - OPENS_BEFORE_FIRST_TIP_MS && now < Math.max(...tips) + CLOSES_AFTER_LAST_TIP_MS;
  });
  const latest = open.sort(([a], [b]) => b.localeCompare(a))[0]?.[1] ?? [];
  return [...latest].sort((a, b) => (a.utc_date ?? "").localeCompare(b.utc_date ?? "") || a.game_code - b.game_code);
}

/** A game's strip entry: the live feed while it has one, the stored result once played. */
export function tickerGame(fixture: TickerFixture, snapshot: TickerSnapshot | undefined, now: number): TickerGame {
  const played = Boolean(fixture.played);
  const state = gameStateOf({ played, snapshot, now });
  const fromFeed = snapshot && !played;
  return {
    code: fixture.game_code,
    home: fixture.local_club,
    away: fixture.road_club,
    state,
    homeScore: fromFeed ? snapshot.localScore : played ? fixture.local_score ?? 0 : null,
    awayScore: fromFeed ? snapshot.roadScore : played ? fixture.road_score ?? 0 : null,
    tipOff: fixture.utc_date || null,
    clock: state === "live" || state === "stale" ? clockLabel(snapshot?.detail?.period, snapshot?.detail?.clock) : null,
  };
}

/** Live games lead, then the ones still to come, then the finished. */
export function tickerOrder(games: readonly TickerGame[]): TickerGame[] {
  const rank: Record<GameState, number> = { live: 0, stale: 0, scheduled: 1, fulltime: 2, final: 2 };
  return [...games].sort((a, b) => rank[a.state] - rank[b.state] || (a.tipOff ?? "").localeCompare(b.tipOff ?? "") || a.code - b.code);
}
