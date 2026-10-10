import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import type { ScoutMove } from "@/lib/advisor/scout";
import type { WireRow } from "@/lib/advisor/wire";

import type { RoundFacts } from "./round-facts";
import type { SummaryResult } from "./summary";
import { runWriteupPass } from "./writeup-pass";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const USAGE = { inputTokens: 1, outputTokens: 1, thinkingTokens: 0 };

const row = (id: string, five: number): WireRow => ({
  id,
  name: `${id}, P`,
  clubCode: "PAN",
  position: "G",
  status: "active",
  outlook: {
    next: [five, five, five],
    runs: ["easy", "even", "even"],
    role: "starter",
    gamesInRole: 5,
    baseSource: "current",
    confidence: "high",
    inputs: { ratePerMinute: 48, minutes: 285, startsRecent: 5, gamesRecent: 5, winChance: 50 },
  },
});
const move: ScoutMove = { drop: row("d1", 900), add: row("a1", 1400), gain: 500, confidence: "high" };

function facts(round: number): RoundFacts {
  return {
    version: 1,
    round,
    text: `META · round ${round}\n@T1 · 1st · 201.5`,
    refs: { "@T1": { kind: "member", id: "m1" } },
    privateNames: [],
    numbersByToken: new Map(),
    sharedNumbers: new Set(),
  };
}

function setup(leagues: string[]) {
  const pb = fakePb({ data: { ai_writeups: [], stat_imports: [], leagues: leagues.map((id) => ({ id, status: "season", settings: {} })) } });
  const order: string[] = [];
  const pass = () =>
    runWriteupPass({
      pb: pb.client,
      season: "E2026",
      apiKey: "k",
      model: "m",
      now: () => NOW,
      readComplete: async () => [3],
      readFacts: async (_league, round) => facts(round),
      write: async ({ facts: sheet }): Promise<SummaryResult> => {
        order.push(`round ${sheet.round}`);
        return {
          ok: true,
          writeup: { headline: "@T1 takes the round on 201.5", lines: ["@T1 won with 201.5 fantasy points.", "@T1 leads the table.", "@T1 again."], sections: {} },
          violations: [],
          warnings: [],
          attempts: 1,
          usage: USAGE,
          model: "m",
          latencyMs: 1,
        };
      },
      readScoutInput: async () => ({ ruleset: "euroleague", members: [{ memberId: "m1", moves: [move] }], privateNames: [] }),
      writeReasons: async () => {
        order.push("scout");
        return {
          byMember: { m1: { ok: true, reasons: { "d1|a1": "The added player starts every night now. His run ahead is easy." } } },
          usage: USAGE,
          model: "m",
          calls: 1,
        };
      },
    });
  return { pass, order };
}

describe("runWriteupPass", () => {
  it("writes the scout's reasons before the round write-up when both are due", async () => {
    const { pass, order } = setup(["L1"]);
    await pass();
    expect(order).toEqual(["scout", "round 3"]);
  });

  it("shares the two calls a pass: two leagues' reasons leave the round write-up for the next pass", async () => {
    const { pass, order } = setup(["L1", "L2"]);
    await pass();
    expect(order).toEqual(["scout", "scout"]);
    await pass();
    expect(order).toEqual(["scout", "scout", "round 3", "round 3"]);
  });
});
