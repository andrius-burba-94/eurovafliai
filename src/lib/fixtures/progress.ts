/**
 * Where the season stands: the last round that is over, and the round being
 * played or about to be.
 *
 * A standings snapshot is not a finished round. `recomputeStandings` writes one
 * after a round's first recorded game, so the newest snapshot is often a round
 * with games still to play. Crowns, spoons, badges, moments and a round's story
 * are facts about finished rounds, so they all read `lastComplete` from here.
 *
 * A round with a snapshot and no stored fixtures counts as complete: nothing
 * says a game is left, and a league whose schedule was never ingested still
 * gets its table's honours.
 */

type ProgressRow = {
  readonly round: number;
  readonly played: boolean;
  readonly utcDate: string | null;
};

export type CurrentRound = {
  readonly round: number;
  /** A game has tipped off, been recorded, or been counted into a snapshot. */
  readonly started: boolean;
  readonly played: number;
  readonly total: number;
};

export type RoundProgress = {
  /**
   * Snapshot rounds with no game left. A set, not a threshold: a postponed
   * game keeps its round open while later rounds finish.
   */
  readonly complete: readonly number[];
  readonly lastComplete: number | null;
  /** The earliest round with a game to play; null once every game is played. */
  readonly current: CurrentRound | null;
};

export function roundProgress({
  fixtures,
  snapshotRounds,
  now,
}: {
  fixtures: readonly ProgressRow[];
  snapshotRounds: readonly number[];
  now: number;
}): RoundProgress {
  const unplayed = new Set(fixtures.filter((row) => !row.played).map((row) => row.round));
  const complete = [...new Set(snapshotRounds.filter((round) => !unplayed.has(round)))].sort((a, b) => a - b);
  const lastComplete = complete.at(-1) ?? null;

  if (unplayed.size === 0) return { complete, lastComplete, current: null };
  const round = Math.min(...unplayed);
  const games = fixtures.filter((row) => row.round === round);
  const played = games.filter((row) => row.played).length;
  const tippedOff = games.some((row) => {
    const tip = row.utcDate ? Date.parse(row.utcDate) : Number.NaN;
    return Number.isFinite(tip) && tip <= now;
  });
  return {
    complete,
    lastComplete,
    current: {
      round,
      started: played > 0 || tippedOff || snapshotRounds.includes(round),
      played,
      total: games.length,
    },
  };
}

/** The snapshots of finished rounds only, for anything that crowns a round. */
export function completedOnly<T extends { readonly round: number }>(
  snapshots: readonly T[],
  progress: Pick<RoundProgress, "complete">,
): T[] {
  const complete = new Set(progress.complete);
  return snapshots.filter((snapshot) => complete.has(snapshot.round));
}
