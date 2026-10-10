import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb, type FakeRecord } from "../../../tests/unit/helpers/fake-pb";

import type { ScoutMove } from "@/lib/advisor/scout";
import type { WireRow } from "@/lib/advisor/wire";

import { GeminiQuota } from "./gemini";
import { runScoutPass, type ScoutPassDeps } from "./scout-pass";
import type { ScoutFactsInput } from "./scout-facts-store";
import type { ScoutReasonsResult } from "./scout-reasons";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const USAGE = { inputTokens: 10, outputTokens: 5, thinkingTokens: 0 };

function player(id: string, five: number): WireRow {
  return {
    id,
    name: `${id}, P`,
    clubCode: "PAN",
    position: "G",
    status: "active",
    outlook: {
      next: [five, five, five],
      runs: ["easy", "even", "even"],
      role: "starter",
      gamesInRole: 4,
      baseSource: "current",
      confidence: "medium",
      inputs: { ratePerMinute: 48, minutes: 285, startsRecent: 4, gamesRecent: 5, winChance: 64 },
    },
  };
}
const move = (drop: string, add: string, dropFive = 900, addFive = 1400): ScoutMove => ({
  drop: player(drop, dropFive),
  add: player(add, addFive),
  gain: addFive - dropFive,
  confidence: "medium",
});

const twoMembers = (): ScoutFactsInput => ({
  ruleset: "euroleague",
  members: [
    { memberId: "m1", moves: [move("d1", "a1")] },
    { memberId: "m2", moves: [move("d2", "a2")] },
  ],
  privateNames: [],
});

const league = (id: string, ai?: unknown): FakeRecord => ({ id, status: "season", settings: ai === undefined ? {} : { ai } });

/** Every member's reasons, keyed the way the pass stores them. */
const answerFor = (members: readonly string[], ok = true): ScoutReasonsResult => ({
  byMember: Object.fromEntries(
    members.map((memberId) => [
      memberId,
      ok ? { ok: true as const, reasons: { [`d${memberId.slice(1)}|a${memberId.slice(1)}`]: "The added player has been a steady starter of late. His calendar ahead looks kind." } } : { ok: false as const, violations: ["M1: 99.9 is not in the facts"] },
    ]),
  ),
  usage: USAGE,
  model: "m",
  calls: ok ? 1 : 2,
});

function harness(
  data: FakeDb,
  {
    complete = { L1: [1, 2, 3] } as Record<string, number[]>,
    input = (): ScoutFactsInput | null => twoMembers(),
    answer = (members: readonly string[]): ScoutReasonsResult | Error => answerFor(members),
    apiKey = "k",
    budget = 2,
  } = {},
) {
  const pb = fakePb({ data: { ai_writeups: [], ...data } });
  const calls: string[][] = [];
  const deps: ScoutPassDeps = {
    pb: pb.client,
    season: "E2026",
    apiKey,
    model: "m",
    now: () => NOW,
    budget,
    readComplete: async (leagueId) => complete[leagueId] ?? [],
    readInput: async () => input(),
    write: async ({ moves }) => {
      const members = [...new Set(moves!.map((entry) => entry.memberId))];
      calls.push(members);
      const result = answer(members);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { pb, deps, calls };
}

describe("runScoutPass", () => {
  it("writes one private row per member with one call per league, for the round just finished", async () => {
    const { pb, deps, calls } = harness({ leagues: [league("L1")] });

    const report = await runScoutPass(deps);

    expect(calls).toEqual([["m1", "m2"]]);
    expect(report).toMatchObject({ written: 2, calls: 1 });
    const rows = pb.rows("ai_writeups");
    expect(rows.map((row) => [row.member, row.round, row.kind, row.status, row.voice])).toEqual([
      ["m1", 3, "scout_moves", "ready", "analyst"],
      ["m2", 3, "scout_moves", "ready", "analyst"],
    ]);
    expect(rows[0]!.output).toEqual({ reasons: { "d1|a1": "The added player has been a steady starter of late. His calendar ahead looks kind." } });
    // A member's row carries that member's tokens and nobody else's.
    const refs = Object.values(rows[0]!.refs as Record<string, { id: string }>).map((ref) => ref.id).sort();
    expect(refs).toEqual(["a1", "d1", "m1"]);
  });

  it("asks nothing again on the next pass", async () => {
    const { deps, calls } = harness({ leagues: [league("L1")] });
    await runScoutPass(deps);
    await runScoutPass(deps);
    expect(calls).toHaveLength(1);
  });

  it("asks for nobody before a round has finished, and nothing with write-ups off or no key", async () => {
    expect((await runScoutPass(harness({ leagues: [league("L1")] }, { complete: {} }).deps)).calls).toBe(0);
    const off = harness({ leagues: [league("L1", { enabled: false, voice: "pundit" })] });
    expect((await runScoutPass(off.deps)).calls).toBe(0);
    expect(off.pb.rows("ai_writeups")).toEqual([]);
    const keyless = harness({ leagues: [league("L1")] }, { apiKey: "" });
    expect(await runScoutPass(keyless.deps)).toMatchObject({ calls: 0, stopped: "no GEMINI_API_KEY" });
  });

  it("holds to the pass's share of the shared cap", async () => {
    const { deps, calls } = harness({ leagues: [league("L1"), league("L2"), league("L3")] }, { complete: { L1: [3], L2: [3], L3: [3] }, budget: 2 });
    const report = await runScoutPass(deps);
    expect(calls).toHaveLength(2);
    expect(report.calls).toBe(2);
  });

  it("writes nothing for a league whose members have no move worth making", async () => {
    const { deps, calls, pb } = harness({ leagues: [league("L1")] }, { input: () => ({ ruleset: "euroleague", members: [], privateNames: [] }) });
    await runScoutPass(deps);
    expect(calls).toEqual([]);
    expect(pb.rows("ai_writeups")).toEqual([]);
  });

  it("stores a twice-refused member as failed, so the page keeps the numbers alone", async () => {
    const { deps, pb } = harness({ leagues: [league("L1")] }, { answer: (members) => answerFor(members, false) });
    const report = await runScoutPass(deps);
    expect(report.refused).toBe(2);
    expect(pb.rows("ai_writeups").map((row) => [row.status, row.error])).toEqual([
      ["failed", "M1: 99.9 is not in the facts"],
      ["failed", "M1: 99.9 is not in the facts"],
    ]);
  });

  it("fails the claimed rows and stops the pass when Google says not now", async () => {
    const { deps, pb } = harness({ leagues: [league("L1"), league("L2")] }, { complete: { L1: [3], L2: [3] }, answer: () => new GeminiQuota("429") });
    const report = await runScoutPass(deps);
    expect(report.stopped).toContain("quota");
    expect(pb.rows("ai_writeups").every((row) => row.status === "failed" && row.league === "L1")).toBe(true);
  });

  it("tries a failed row again on the next pass, until the store's attempts run out", async () => {
    let fail = true;
    const { deps, calls, pb } = harness({ leagues: [league("L1")] }, { answer: (members) => (fail ? new GeminiQuota("429") : answerFor(members)) });
    await runScoutPass(deps);
    fail = false;
    await runScoutPass(deps);
    expect(calls).toHaveLength(2);
    expect(pb.rows("ai_writeups").every((row) => row.status === "ready")).toBe(true);
  });

  it("re-guards a day later and keeps reasons the fresh sheet still supports", async () => {
    const first = harness({ leagues: [league("L1")] });
    await runScoutPass(first.deps);
    // A day on, the outlook moved, so the sheet's hash did; the stored prose cites no number.
    const later = { ...first.deps, now: () => NOW + 25 * 60 * 60_000, readInput: async () => ({ ...twoMembers(), members: [{ memberId: "m1", moves: [move("d1", "a1", 900, 1500)] }] }) };
    const calls: string[][] = [];
    const report = await runScoutPass({ ...later, write: async (args) => { calls.push([]); return first.deps.write!(args); } });
    expect(calls).toEqual([]);
    expect(report.guarded).toBe(1);
  });
});
