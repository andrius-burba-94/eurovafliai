import { describe, expect, it } from "vitest";

import { completedOnly, roundProgress } from "./progress";

const NOW = Date.parse("2026-10-15T19:00:00Z");

function games(round: number, played: number, total: number, tip = "2026-10-15T18:00:00Z") {
  return Array.from({ length: total }, (_, index) => ({ round, played: index < played, utcDate: tip }));
}

describe("roundProgress", () => {
  it("does not call a round complete while a game is left, even with a snapshot", () => {
    const progress = roundProgress({
      fixtures: [...games(1, 10, 10), ...games(2, 6, 10)],
      snapshotRounds: [1, 2],
      now: NOW,
    });
    expect(progress.lastComplete).toBe(1);
    expect(progress.current).toEqual({ round: 2, started: true, played: 6, total: 10 });
  });

  it("reads a round as started once a game has tipped off, before anything is recorded", () => {
    const progress = roundProgress({
      fixtures: [...games(1, 10, 10), ...games(2, 0, 10, "2026-10-15T18:30:00Z")],
      snapshotRounds: [1],
      now: NOW,
    });
    expect(progress.current).toEqual({ round: 2, started: true, played: 0, total: 10 });
  });

  it("is between rounds when the next round has not tipped off", () => {
    const progress = roundProgress({
      fixtures: [...games(1, 10, 10), ...games(2, 0, 10, "2026-10-22T18:00:00Z")],
      snapshotRounds: [1],
      now: NOW,
    });
    expect(progress.lastComplete).toBe(1);
    expect(progress.current?.started).toBe(false);
  });

  it("has no complete round before the first one ends", () => {
    const progress = roundProgress({ fixtures: games(1, 3, 10), snapshotRounds: [1], now: NOW });
    expect(progress.lastComplete).toBeNull();
    expect(progress.current?.round).toBe(1);
  });

  it("counts a snapshot with no stored fixtures as complete", () => {
    expect(roundProgress({ fixtures: [], snapshotRounds: [1, 2], now: NOW })).toEqual({
      complete: [1, 2],
      lastComplete: 2,
      current: null,
    });
  });

  it("has no current round once every game is played", () => {
    const progress = roundProgress({ fixtures: [...games(37, 10, 10), ...games(38, 10, 10)], snapshotRounds: [37, 38], now: NOW });
    expect(progress).toEqual({ complete: [37, 38], lastComplete: 38, current: null });
  });

  it("ignores an untimed game when deciding whether a round started", () => {
    const progress = roundProgress({
      fixtures: [{ round: 1, played: false, utcDate: null }],
      snapshotRounds: [],
      now: NOW,
    });
    expect(progress.current?.started).toBe(false);
  });

  it("keeps a round with a postponed game open while later rounds finish", () => {
    const progress = roundProgress({
      fixtures: [...games(1, 10, 10), ...games(2, 9, 10, "2026-11-20T18:00:00Z"), ...games(3, 10, 10)],
      snapshotRounds: [1, 2, 3],
      now: NOW,
    });
    expect(progress.complete).toEqual([1, 3]);
    expect(progress.lastComplete).toBe(3);
  });
});

describe("completedOnly", () => {
  it("keeps only the snapshots of complete rounds", () => {
    const snapshots = [{ round: 1 }, { round: 2 }, { round: 3 }];
    expect(completedOnly(snapshots, { complete: [1, 3] })).toEqual([{ round: 1 }, { round: 3 }]);
    expect(completedOnly(snapshots, { complete: [] })).toEqual([]);
  });
});
