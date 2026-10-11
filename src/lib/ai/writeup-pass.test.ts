import { describe, expect, it } from "vitest";

import { briefSheet } from "../../../tests/unit/helpers/brief-sheet";
import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import type { ScoutMove } from "@/lib/advisor/scout";
import type { WireRow } from "@/lib/advisor/wire";

import { GeminiQuota } from "./gemini";
import type { RoundFacts } from "./round-facts";
import type { SummaryResult } from "./summary";
import { runRequestedRewrites, runWriteupPass } from "./writeup-pass";

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

function setup(leagues: string[], { scoutBreaks = false, briefsBreak = false, briefsCallBreaks = false, roundBreaks = false, roundQuota = false } = {}) {
  const pb = fakePb({
    data: {
      ai_writeups: [],
      stat_imports: [],
      leagues: leagues.map((id) => ({ id, status: "season", settings: {} })),
      league_members: leagues.flatMap((id) => ["m1", "m2", "m3"].map((member) => ({ id: member, league: id }))),
    },
  });
  const order: string[] = [];
  const deps = () =>
    ({
      pb: pb.client,
      season: "E2026",
      apiKey: "k",
      model: "m",
      now: () => NOW,
      readComplete: async () => [3],
      readFacts: async (_league, round) => {
        if (roundBreaks) throw new Error("PocketBase went away");
        return facts(round);
      },
      write: async ({ facts: sheet }): Promise<SummaryResult> => {
        order.push(`round ${sheet.round}`);
        if (roundQuota) throw new GeminiQuota("429");
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
      readBriefFacts: async () => {
        if (briefsBreak) throw new Error("PocketBase went away");
        return briefSheet();
      },
      writeBriefs: async ({ memberIds = [] }) => {
        order.push("briefs");
        if (briefsCallBreaks) throw new Error("socket hang up");
        return {
          byMember: Object.fromEntries(
            memberIds.map((memberId) => [memberId, { ok: true as const, brief: { result: "A night.", standing: "A place.", next: "A run." } }]),
          ),
          usage: USAGE,
          model: "m",
          calls: 1,
        };
      },
      readScoutInput: async () => {
        if (scoutBreaks) throw new Error("PocketBase went away");
        return { ruleset: "euroleague", members: [{ memberId: "m1", moves: [move] }], privateNames: [] };
      },
      writeReasons: async () => {
        order.push("scout");
        return {
          byMember: { m1: { ok: true, reasons: { "d1|a1": "The added player starts every night now. His run ahead is easy." } } },
          usage: USAGE,
          model: "m",
          calls: 1,
        };
      },
    }) satisfies Parameters<typeof runWriteupPass>[0];
  return { pb, order, pass: () => runWriteupPass(deps()), requested: () => runRequestedRewrites(deps()) };
}

describe("runWriteupPass", () => {
  it("writes the round, then the briefs, then the scout's reasons, two calls a pass", async () => {
    const { pass, order } = setup(["L1"]);
    await pass();
    expect(order).toEqual(["round 3", "briefs"]);
    await pass();
    expect(order).toEqual(["round 3", "briefs", "scout"]);
  });

  it("keeps that order across leagues: every round write-up before any brief, every brief before any reason", async () => {
    const { pass, order } = setup(["L1", "L2"]);
    await pass();
    expect(order).toEqual(["round 3", "round 3"]);
    await pass();
    expect(order).toEqual(["round 3", "round 3", "briefs", "briefs"]);
    await pass();
    expect(order).toEqual(["round 3", "round 3", "briefs", "briefs", "scout", "scout"]);
  });

  it("ends the pass when Google says not now to the round write-up", async () => {
    const { pass, order } = setup(["L1"], { roundQuota: true });
    expect((await pass()).stopped).toContain("quota");
    expect(order).toEqual(["round 3"]);
  });

  it("still writes the briefs and reasons when the round's read breaks, then reports the fault", async () => {
    const { pass, order } = setup(["L1"], { roundBreaks: true });
    await expect(pass()).rejects.toThrow("PocketBase went away");
    expect(order).toEqual(["briefs", "scout"]);
  });

  it("still writes the reasons when the briefs' read breaks", async () => {
    const { pass, order } = setup(["L1"], { briefsBreak: true });
    await pass();
    expect(order).toEqual(["round 3", "scout"]);
  });

  it("spends a briefs call that throws, so the scout gets only what is left", async () => {
    const { pass, order } = setup(["L1"], { briefsCallBreaks: true });
    await pass();
    expect(order).toEqual(["round 3", "briefs"]);
  });

  it("still writes the round and the briefs when the scout's read breaks", async () => {
    const { pass, order } = setup(["L1"], { scoutBreaks: true });
    await pass();
    await pass();
    expect(order).toEqual(["round 3", "briefs"]);
  });
});

describe("runRequestedRewrites", () => {
  it("rewrites a requested round and its requested briefs from one minute's budget, and answers every request", async () => {
    const { pb, pass, requested, order } = setup(["L1"]);
    await pass();
    for (const row of pb.rows("ai_writeups")) row.rewrite_requested_at = "2026-10-09 11:59:00.000Z";
    order.length = 0;

    await requested();

    expect(order).toEqual(["round 3", "briefs"]);
    expect(pb.rows("ai_writeups").map((row) => row.rewrite_requested_at)).toEqual(["", "", "", ""]);
  });

  it("asks nothing when nothing is requested", async () => {
    const { pass, requested, order } = setup(["L1"]);
    await pass();
    order.length = 0;
    await requested();
    expect(order).toEqual([]);
  });
});
