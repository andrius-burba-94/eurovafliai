import { describe, expect, it } from "vitest";

import { MOVE_THRESHOLD, MOVES_SHOWN, movesWorthMaking, type MoveInput } from "./moves";
import type { WireOutlook } from "./wire";

const TEMPLATE = { G: 5, F: 5, C: 3 };

const outlook = (five: number, over: Partial<WireOutlook> = {}): WireOutlook => ({
  next: [five, five, five],
  runs: ["even", "even", "even"],
  role: "starter",
  gamesInRole: 5,
  baseSource: "current",
  confidence: "high",
  inputs: { ratePerMinute: 50, minutes: 200, startsRecent: 5, gamesRecent: 5, winChance: 50 },
  ...over,
});

/** 5 G / 5 F / 3 C, every one rated 1000 (10.0 a game). */
function roster(): MoveInput["roster"] {
  return [
    ...[1, 2, 3, 4, 5].map((n) => ({ id: `g${n}`, position: "G" as const })),
    ...[1, 2, 3, 4, 5].map((n) => ({ id: `f${n}`, position: "F" as const })),
    ...[1, 2, 3].map((n) => ({ id: `c${n}`, position: "C" as const })),
  ];
}

function input(over: Partial<Omit<MoveInput, "outlooks">> = {}): MoveInput & { outlooks: Map<string, WireOutlook> } {
  const outlooks = new Map<string, WireOutlook>(roster().map((player) => [player.id, outlook(1000)]));
  return { roster: roster(), template: TEMPLATE, freeAgents: [], outlooks, threshold: MOVE_THRESHOLD.euroleague, ...over };
}

const agent = (id: string, position: "G" | "F" | "C", status = "active") => ({ id, position, status });

describe("movesWorthMaking", () => {
  it("swaps like for like, so the roster still counts 5 G / 5 F / 3 C in the league's positions", () => {
    const base = input();
    base.outlooks.set("g1", outlook(500));
    // A forward far better than g1 is no answer to a weak guard: it would make 4 G / 6 F.
    base.outlooks.set("fa-f", outlook(2500));
    base.outlooks.set("fa-g", outlook(900));
    const result = movesWorthMaking({ ...base, freeAgents: [agent("fa-f", "F"), agent("fa-g", "G")] });
    expect(result.moves.map((move) => [move.drop, move.add])).toEqual([["f1", "fa-f"], ["g1", "fa-g"]]);
  });

  it("counts positions as the league's game does: a player the game calls C is a center here", () => {
    // The Omoruyi case: F in the feed, C in BasketNews. The reader passes the game's position.
    const base = input();
    base.outlooks.set("omoruyi", outlook(1500));
    const asCenter = movesWorthMaking({ ...base, freeAgents: [agent("omoruyi", "C")] });
    expect(asCenter.moves[0]).toMatchObject({ drop: "c1", add: "omoruyi" });
    const asForward = movesWorthMaking({ ...base, freeAgents: [agent("omoruyi", "F")] });
    expect(asForward.moves[0]).toMatchObject({ drop: "f1", add: "omoruyi" });
  });

  it("suggests a move at exactly the threshold and not a hundredth under it", () => {
    const base = input();
    base.outlooks.set("at", outlook(1000 + MOVE_THRESHOLD.euroleague));
    base.outlooks.set("under", outlook(1000 + MOVE_THRESHOLD.euroleague - 1));
    expect(movesWorthMaking({ ...base, freeAgents: [agent("at", "G")] }).moves).toHaveLength(1);
    expect(movesWorthMaking({ ...base, freeAgents: [agent("under", "G")] }).moves).toEqual([]);
  });

  it("holds a BasketNews league to its own bar in Modern points", () => {
    const base = input({ threshold: MOVE_THRESHOLD.basketnews });
    base.outlooks.set("x", outlook(1000 + MOVE_THRESHOLD.euroleague));
    expect(movesWorthMaking({ ...base, freeAgents: [agent("x", "G")] }).moves).toEqual([]);
  });

  it("lists at most three, best first, and drops or adds nobody twice", () => {
    const base = input();
    base.outlooks.set("g1", outlook(100));
    const agents = ["a", "b", "c", "d", "e"].map((id) => agent(id, "G"));
    agents.forEach((row, index) => base.outlooks.set(row.id, outlook(2000 - index * 100)));
    const { moves } = movesWorthMaking({ ...base, freeAgents: agents });
    expect(moves).toHaveLength(MOVES_SHOWN);
    expect(moves.map((move) => move.add)).toEqual(["a", "b", "c"]);
    // The worst guard goes first; then the next worst, never g1 twice.
    expect(moves.map((move) => move.drop)).toEqual(["g1", "g2", "g3"]);
    expect(moves.map((move) => move.gain)).toEqual([1900, 900, 800]);
  });

  it("never adds an injured player, nor one with no figure, nor drops one with no figure", () => {
    const base = input();
    base.outlooks.set("hurt", outlook(3000));
    base.outlooks.delete("g2");
    const { moves } = movesWorthMaking({
      ...base,
      freeAgents: [agent("hurt", "G", "injured"), agent("unrated", "G")],
    });
    expect(moves).toEqual([]);
  });

  it("takes the confidence of the less certain player", () => {
    const base = input();
    base.outlooks.set("g1", outlook(500, { confidence: "medium" }));
    base.outlooks.set("x", outlook(2000, { confidence: "low" }));
    base.outlooks.set("y", outlook(1900, { confidence: "high" }));
    const { moves } = movesWorthMaking({ ...base, freeAgents: [agent("x", "G"), agent("y", "G")] });
    expect(moves.map((move) => move.confidence)).toEqual(["low", "high"]);
  });

  it("suggests nothing for a roster that does not count the template, and says so", () => {
    const base = input();
    base.outlooks.set("x", outlook(3000));
    const short = movesWorthMaking({ ...base, roster: roster().slice(1), freeAgents: [agent("x", "G")] });
    expect(short).toEqual({ countsTemplate: false, moves: [] });
    const full = movesWorthMaking({ ...base, freeAgents: [agent("x", "G")] });
    expect(full.countsTemplate).toBe(true);
  });
});
