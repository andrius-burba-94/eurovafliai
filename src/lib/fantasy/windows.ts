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
 */

export type RoundWindow = {
  readonly round: number;
  /** First tip-off: the official rosters freeze. */
  readonly lockAt: number;
  /** Writes stop: late enough to catch a correction, early enough that the next round's trades cannot have started. */
  readonly closesAt: number;
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
/** Inside a freeze: hourly, give or take a pass. */
export const APPLY_EVERY_MS = 55 * 60_000;
/** Outside one: a preview four times a day is plenty to see what is coming. */
export const PREVIEW_EVERY_MS = 6 * 60 * 60_000;

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
      const sorted = [...times].sort((a, b) => a - b);
      const lockAt = sorted[0]!;
      const lastTip = sorted.filter((at) => at <= lockAt + ROUND_SPAN_MS).at(-1)!;
      return { round, lockAt, closesAt: lastTip + CLOSE_AFTER_LAST_TIP_MS };
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

/**
 * Is a pass due?
 *
 * `lastApplyAt` is the last apply for the decided round — a new round's freeze
 * syncs at once however recently the previous one did. `lastRunAt` is the last
 * run of any kind.
 */
export function syncDue(
  now: number,
  decision: SyncDecision,
  lastApplyAt: number | null,
  lastRunAt: number | null,
): boolean {
  if (decision.mode === "apply") return lastApplyAt === null || now - lastApplyAt >= APPLY_EVERY_MS;
  return lastRunAt === null || now - lastRunAt >= PREVIEW_EVERY_MS;
}

export type LineupRunRef = {
  readonly round: number;
  readonly ranAt: number;
  readonly status: string;
};

/**
 * Which rounds' lineups to read from the official game now.
 *
 * A frozen round hourly, like its rosters. A finished round once more after
 * its freeze closes, which is the pass its standings keep, and which is also
 * how a round from before the lineup sync existed is filled in. A finished
 * round none of whose passes since closing applied is tried again four times
 * a day, so a refused token or an unanswered question heals once fixed.
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
  const due: number[] = [];
  for (const window of windows) {
    if (now < window.lockAt + APPLY_AFTER_LOCK_MS) continue;
    const mine = runs.filter((run) => run.round === window.round);
    const last = Math.max(Number.NEGATIVE_INFINITY, ...mine.map((run) => run.ranAt));
    if (now <= window.closesAt) {
      if (force || now - last >= APPLY_EVERY_MS) due.push(window.round);
      continue;
    }
    const sinceClose = mine.filter((run) => run.ranAt > window.closesAt);
    if (sinceClose.length === 0) due.push(window.round);
    else if (sinceClose.every((run) => run.status !== "applied") && (force || now - last >= PREVIEW_EVERY_MS)) {
      due.push(window.round);
    }
  }
  return due;
}
