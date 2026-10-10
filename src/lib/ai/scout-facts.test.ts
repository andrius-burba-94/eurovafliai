import { describe, expect, it } from "vitest";

import type { ScoutMove } from "@/lib/advisor/scout";
import type { WireRow } from "@/lib/advisor/wire";

import { buildScoutFacts } from "./scout-facts";

function player(id: string, name: string, five: number, over: Partial<WireRow["outlook"] & object> = {}, status = "active"): WireRow {
  return {
    id,
    name,
    clubCode: "PAN",
    position: "G",
    status,
    outlook: {
      next: [five, five - 60, five - 30],
      runs: ["easy", "even", "even"],
      role: "starter",
      gamesInRole: 4,
      baseSource: "current",
      confidence: "medium",
      inputs: { ratePerMinute: 48, minutes: 285, startsRecent: 4, gamesRecent: 5, winChance: 64 },
      ...over,
    },
  };
}

const move = (drop: WireRow, add: WireRow, gain: number): ScoutMove => ({ drop, add, gain, confidence: "medium" });

const andrius = {
  memberId: "m1",
  moves: [move(player("obst", "Obst, Andreas", 960, { role: "reserve", inputs: { ratePerMinute: 40, minutes: 190, startsRecent: 0, gamesRecent: 5, winChance: 31 } }), player("fra", "Francisco, Sylvain", 1380), 420)],
};
const jonas = { memberId: "m2", moves: [move(player("luc", "Lucic, Vladimir", 890), player("mas", "Massa, Bodian", 1250, { baseSource: "last", gamesInRole: 0 }), 360)] };

const input = {
  ruleset: "euroleague" as const,
  members: [andrius, jonas],
  privateNames: ["Vaflių fabrikas", "Andrius", "Jonas", "EuroVafliai 26-27", "Obst, Andreas", "Andreas Obst", "Sylvain Francisco"],
};

describe("buildScoutFacts", () => {
  it("prints each move as one block of pre-formatted figures, in tokens", () => {
    const facts = buildScoutFacts(input);
    const first = facts.moves.find((entry) => entry.memberId === "m1")!;
    const add = facts.tokens.get("fra")!;
    const drop = facts.tokens.get("obst")!;
    expect(first.text).toContain(`MOVE ${first.id} · drop ${drop} · add ${add} · gain +4.2 fantasy points a game over the next 5 · confidence medium`);
    expect(first.text).toContain(`ADD ${add} · next 5 / 10 / 15: 13.8 / 13.2 / 13.5 · 0.48 PIR a minute · 28.5 minutes a game as a starter · started 4 of his last 5 · next 5 games: easy run · club: favourite · available`);
    expect(first.text).toContain(`DROP ${drop}`);
    expect(first.text).toContain("off the bench");
    expect(first.text).toContain("club: underdog");
  });

  it("says when a figure rests on last season", () => {
    const facts = buildScoutFacts(input);
    expect(facts.moves.find((entry) => entry.memberId === "m2")!.text).toContain("rated on last season's games");
  });

  it("speaks Modern points in a BasketNews league", () => {
    const facts = buildScoutFacts({ ...input, ruleset: "basketnews" });
    expect(facts.text).toContain("Modern points a game");
    expect(facts.text).toContain("Modern points a minute");
    expect(facts.text).not.toContain("PIR a minute");
  });

  it("never sends a name: every team and player is a token", () => {
    const facts = buildScoutFacts(input);
    for (const name of ["Obst", "Francisco", "Lucic", "Massa", "Andrius", "Jonas", "Vaflių", "EuroVafliai"]) {
      expect(facts.text).not.toContain(name);
    }
  });

  it("keeps a member's section to that member's own moves", () => {
    const facts = buildScoutFacts(input);
    const mine = facts.sectionFor("m1");
    expect(mine).toContain(facts.tokens.get("fra")!);
    expect(mine).not.toContain(facts.tokens.get("mas")!);
    expect(mine).not.toContain(facts.tokens.get("luc")!);
    // A reason may cite its own move's players and nobody else's.
    const own = facts.moves.find((entry) => entry.memberId === "m1")!;
    expect([...own.tokens].sort()).toEqual([facts.tokens.get("fra")!, facts.tokens.get("obst")!].sort());
  });

  it("gives the same tokens and text whatever order the members came in", () => {
    const a = buildScoutFacts(input);
    const b = buildScoutFacts({ ...input, members: [jonas, andrius] });
    expect(b.text).toBe(a.text);
    expect(b.sectionFor("m1")).toBe(a.sectionFor("m1"));
  });
});
