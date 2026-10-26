/**
 * When the official rosters are the ones playing.
 *
 * Pure. The official game freezes rosters from a round's first tip-off until
 * its games are done, and reopens them for the next round afterwards. Only a
 * roster read inside that freeze is the round's roster, so only then does the
 * sync write. Outside it the official rosters may be half-way through somebody's
 * Tuesday-morning changes, and the sync only previews.
 *
 * The freeze is taken from our own fixtures rather than from the official game,
 * whose API exposes no deadline.
 *
 * A round is two or three game days. Inside its freeze a sync reads once per
 * game day, five minutes after that day's first tip-off, which is when the
 * day's players freeze in their roles (`freezeRoles`); once more when the round
 * has settled; and every six hours between rounds. BasketNews runs on the same
 * clock (`basketNewsDue`).
 */

import { gameDayOf } from "@/lib/time/local";

export type RoundWindow = {
  readonly round: number;
  /** First tip-off: the official rosters freeze. */
  readonly lockAt: number;
  /** Writes stop: late enough to catch a correction, early enough that the next round's trades cannot have started. */
  readonly closesAt: number;
  /**
   * Every distinct tip-off in the round's freeze, first to last. The official
   * game locks a player when his own game starts, so a manager may still
   * swap a starter and move the captain until the round's last tip-off (day
   * 1's captain benched for a day 2 player). Each is a moment the lineup can
   * have changed for good.
   */
  readonly tips: readonly number[];
  /** Each game day's first tip-off, first to last: the moments a sync reads. */
  readonly days: readonly number[];
  /** Three hours past the last tip-off: every game is over and scored, so the round's last read. */
  readonly settledAt: number;
};

export type SyncDecision =
  | { readonly mode: "apply"; readonly round: number }
  | { readonly mode: "preview"; readonly round: number | null };

/** A first sync this long after tip-off: the official game settles its bids at the lock. */
export const APPLY_AFTER_LOCK_MS = 5 * 60_000;
/** Ninety minutes past the round's last tip-off: its last game is still on, so the freeze still holds. */
const CLOSE_AFTER_LAST_TIP_MS = 90 * 60_000;
/** A game this far after the round's first is a postponement, not part of the round's freeze. */
const ROUND_SPAN_MS = 72 * 60 * 60_000;
/** Three hours past the last tip-off its last game is final and its box scores are in. */
const SETTLE_AFTER_LAST_TIP_MS = 3 * 60 * 60_000;
/** Outside one: a preview four times a day is plenty to see what is coming. */
export const PREVIEW_EVERY_MS = 6 * 60 * 60_000;
/** A game day's read that failed is tried again that day, no more often than this. */
export const RETRY_FAILED_MS = 30 * 60_000;

export function roundWindows(
  fixtures: readonly { readonly round: number; readonly utcDate: string | null }[],
): RoundWindow[] {
  const tips = new Map<number, number[]>();
  for (const fixture of fixtures) {
    const at = Date.parse(fixture.utcDate ?? "");
    if (!Number.isFinite(at)) continue;
    tips.set(fixture.round, [...(tips.get(fixture.round) ?? []), at]);
  }
  return [...tips]
    .map(([round, times]) => {
      const sorted = [...new Set(times)].sort((a, b) => a - b);
      const lockAt = sorted[0]!;
      const tips = sorted.filter((at) => at <= lockAt + ROUND_SPAN_MS);
      const days = tips.filter((at, index) => index === 0 || gameDayOf(at) !== gameDayOf(tips[index - 1]!));
      const last = tips.at(-1)!;
      return { round, lockAt, closesAt: last + CLOSE_AFTER_LAST_TIP_MS, tips, days, settledAt: last + SETTLE_AFTER_LAST_TIP_MS };
    })
    .sort((a, b) => a.lockAt - b.lockAt);
}

export function syncModeAt(now: number, windows: readonly RoundWindow[]): SyncDecision {
  const frozen = windows.find(
    (window) => now >= window.lockAt + APPLY_AFTER_LOCK_MS && now <= window.closesAt,
  );
  if (frozen) return { mode: "apply", round: frozen.round };
  const next = windows.find((window) => window.lockAt > now);
  return { mode: "preview", round: next?.round ?? null };
}

export type LineupRunRef = {
  readonly round: number;
  readonly ranAt: number;
  readonly status: string;
};

function latest(runs: readonly LineupRunRef[]): number | null {
  return runs.length ? Math.max(...runs.map((run) => run.ranAt)) : null;
}

/**
 * A game day has begun (plus the settling five minutes) and no read has got
 * through since. A failed or blocked try is no read: an expired session at
 * tip-off would otherwise wait for the next game day. It is tried again after
 * `RETRY_FAILED_MS`.
 */
function dayUnread(now: number, window: RoundWindow, runs: readonly LineupRunRef[]): boolean {
  const day = window.days.filter((at) => now >= at + APPLY_AFTER_LOCK_MS).at(-1);
  if (day === undefined) return false;
  const since = runs.filter((run) => run.ranAt >= day + APPLY_AFTER_LOCK_MS);
  if (since.some((run) => run.status !== "failed" && run.status !== "blocked")) return false;
  const tried = latest(since);
  return tried === null || now - tried >= RETRY_FAILED_MS;
}

/**
 * Is a roster pass due?
 *
 * Inside a freeze, once per game day: rosters cannot change mid-round, but the
 * day's read is the one the lineups freeze from, so both run together.
 * `applyRuns` are the applies for the decided round, so a new round's first
 * game day reads at once however recently the previous round did. Outside a
 * freeze, a preview every six hours (`lastRunAt` is any run).
 */
export function syncDue(
  now: number,
  decision: SyncDecision,
  windows: readonly RoundWindow[],
  applyRuns: readonly LineupRunRef[],
  lastRunAt: number | null,
): boolean {
  if (decision.mode === "apply") {
    const window = windows.find((row) => row.round === decision.round);
    return window ? dayUnread(now, window, applyRuns) : applyRuns.length === 0;
  }
  return lastRunAt === null || now - lastRunAt >= PREVIEW_EVERY_MS;
}

/** One round, against the runs that count for it. */
function roundDue(now: number, window: RoundWindow, runs: readonly LineupRunRef[], force: boolean): boolean {
  if (now < window.lockAt + APPLY_AFTER_LOCK_MS) return false;
  const last = latest(runs);
  if (now <= window.closesAt) return force || dayUnread(now, window, runs);
  if (now < window.settledAt) return force;
  const sinceSettled = runs.filter((run) => run.ranAt >= window.settledAt);
  if (sinceSettled.length === 0) return true;
  return sinceSettled.every((run) => run.status !== "applied") && (force || last === null || now - last >= PREVIEW_EVERY_MS);
}

/**
 * Which rounds' lineups to read from the official game now.
 *
 * A frozen round once per game day, five minutes after the day's first
 * tip-off: the read the day's players freeze from. A round once more after it
 * has settled, which is the pass its standings keep, and which is also how a
 * round from before the lineup sync existed is filled in. A settled round none
 * of whose passes since applied is tried again four times a day, so a refused
 * token or an unanswered question heals once fixed.
 *
 * `force` is a person pressing "Sync now": the frozen round and every
 * unfinished one at once, whatever ran a minute ago.
 */
export function lineupRoundsDue(
  now: number,
  windows: readonly RoundWindow[],
  runs: readonly LineupRunRef[],
  force = false,
): number[] {
  return windows
    .filter((window) => roundDue(now, window, runs.filter((run) => run.round === window.round), force))
    .map((window) => window.round);
}

/**
 * Is a BasketNews pass due? It reads every open round in one job, so its runs
 * count for every round: a game day of any round with no job since, or a
 * round settled with no job since. Between rounds, six hours since the last
 * job, which is how a transfer for the next round arrives before it tips off;
 * inside a round its game days are the only reads.
 */
export function basketNewsDue(now: number, windows: readonly RoundWindow[], runs: readonly LineupRunRef[]): boolean {
  if (windows.some((window) => roundDue(now, window, runs, false))) return true;
  const last = latest(runs);
  const inRound = windows.some((window) => now >= window.lockAt && now < window.settledAt);
  return !inRound && (last === null || now - last >= PREVIEW_EVERY_MS);
}

/**
 * The latest of a round's game days a read at `now` has reached: its first
 * tip-off five minutes gone. A "Sync now" pressed on a game-day morning reaches
 * only the days before, so it freezes nobody who has not played.
 */
export function readDayAt(now: number, window: RoundWindow | undefined): string | null {
  const begun = (window?.days ?? []).filter((day) => now >= day + APPLY_AFTER_LOCK_MS);
  return begun.length ? gameDayOf(begun.at(-1)!) : null;
}
