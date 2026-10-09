import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb, type FakeRecord } from "../../../tests/unit/helpers/fake-pb";

import { GeminiQuota } from "./gemini";
import type { RoundFacts } from "./round-facts";
import { CALLS_PER_PASS, DAILY_MS, runRoundPass, writeRequestedRounds, type RoundPassDeps } from "./round-pass";
import { STALE_AFTER_MS } from "./store";
import type { SummaryResult } from "./summary";
import type { RoundWriteup, Voice } from "./voice";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const stamp = (ms: number) => new Date(ms).toISOString().replace("T", " ");
const USAGE = { inputTokens: 10, outputTokens: 5, thinkingTokens: 0 };

/** A round's sheet; `night` is the one number each round's prose cites. */
function factsFor(round: number, { night = 200 + round, extra = "" } = {}): RoundFacts {
  return {
    version: 1,
    round,
    text: `META · Euroleague round ${round}\nNIGHT\n@T1 · 1st of the night · ${night}.5\n${extra}`,
    refs: { "@T1": { kind: "member", id: "m1" } },
    privateNames: [],
    numbersByToken: new Map(),
    sharedNumbers: new Set(),
  };
}

const writeupFor = (round: number, night = 200 + round): RoundWriteup => ({
  headline: `@T1 takes round ${round} on ${night}.5`,
  lines: [`@T1 won round ${round} with ${night}.5 fantasy points.`, "@T1 stays on top of the table.", "@T1 had the best night again."],
  sections: {},
});

type Call = { round: number; voice: Voice };

function harness(
  data: FakeDb,
  {
    complete = { L1: [1, 2, 3] } as Record<string, number[]>,
    facts = (_league: string, round: number): RoundFacts | null => factsFor(round),
    answer = (round: number): SummaryResult | Error => ({
      ok: true,
      writeup: writeupFor(round),
      violations: [],
      warnings: [],
      attempts: 1,
      usage: USAGE,
      model: "m",
      latencyMs: 1,
    }),
    apiKey = "k",
  } = {},
) {
  const pb = fakePb({ data: { ai_writeups: [], stat_imports: [], ...data } });
  const calls: Call[] = [];
  const deps: RoundPassDeps = {
    pb: pb.client,
    season: "E2026",
    apiKey,
    model: "m",
    now: () => NOW,
    readComplete: async (leagueId) => complete[leagueId] ?? [],
    readFacts: async (leagueId, round) => facts(leagueId, round),
    write: async ({ facts: sheet, voice }) => {
      calls.push({ round: sheet.round, voice });
      const result = answer(sheet.round);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { pb, deps, calls };
}

const league = (id: string, ai?: unknown): FakeRecord => ({ id, status: "season", settings: ai === undefined ? {} : { ai } });

function readyRow(leagueId: string, round: number, over: Record<string, unknown> = {}): FakeRecord {
  return {
    id: `w-${leagueId}-${round}`,
    league: leagueId,
    season: "E2026",
    round,
    kind: "round_summary",
    member: "",
    status: "ready",
    voice: "analyst",
    input_hash: "h".repeat(64),
    output: writeupFor(round),
    attempts: 1,
    generated_at: stamp(NOW - 60_000),
    ...over,
  };
}

const statuses = (pb: ReturnType<typeof fakePb>) =>
  Object.fromEntries(pb.rows("ai_writeups").map((row) => [`${row.league}:${row.round}`, row.status]));

describe("runRoundPass — writing", () => {
  it("writes finished rounds without a write-up, oldest first, at most two calls a pass", async () => {
    const { pb, deps, calls } = harness({ leagues: [league("L1")] });
    const report = await runRoundPass(deps);
    expect(calls.map((call) => call.round)).toEqual([1, 2]);
    expect(CALLS_PER_PASS).toBe(2);
    expect(report).toMatchObject({ written: 2, stopped: null });
    expect(statuses(pb)).toEqual({ "L1:1": "ready", "L1:2": "ready" });
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ member: "", output: writeupFor(1) });

    // The next pass picks up where this one stopped: the backfill needs nobody.
    const next = await runRoundPass(deps);
    expect(calls.map((call) => call.round)).toEqual([1, 2, 3]);
    expect(next.written).toBe(1);
  });

  it("shares the budget across leagues and writes in each league's voice", async () => {
    const { deps, calls } = harness(
      { leagues: [league("L1", { enabled: true, voice: "pundit" }), league("L2")] },
      { complete: { L1: [1], L2: [1, 2] } },
    );
    await runRoundPass(deps);
    expect(calls).toEqual([
      { round: 1, voice: "pundit" },
      { round: 1, voice: "analyst" },
    ]);
  });

  it("leaves a league with write-ups off, and does nothing at all without a key", async () => {
    const off = harness({ leagues: [league("L1", { enabled: false, voice: "analyst" })] });
    await runRoundPass(off.deps);
    expect(off.calls).toEqual([]);

    const keyless = harness({ leagues: [league("L1")] }, { apiKey: "" });
    expect(await runRoundPass(keyless.deps)).toMatchObject({ stopped: "no GEMINI_API_KEY" });
    expect(keyless.calls).toEqual([]);
  });

  it("does not touch a round already written, and skips one the reader refuses", async () => {
    const { deps, calls } = harness(
      { leagues: [league("L1")], ai_writeups: [readyRow("L1", 1)] },
      { facts: (_league, round) => (round === 2 ? null : factsFor(round)) },
    );
    await runRoundPass(deps);
    expect(calls.map((call) => call.round)).toEqual([3]);
  });

  it("counts a round as written while it holds good prose, even after a failed rewrite", async () => {
    const { deps, calls } = harness(
      { leagues: [league("L1")], ai_writeups: [readyRow("L1", 1, { status: "failed", attempts: 1, error: "swing: missing" })] },
      { complete: { L1: [1] } },
    );
    await runRoundPass(deps);
    expect(calls).toEqual([]);
  });

  it("stores a guard refusal as failed and stops asking after three", async () => {
    const refusal: SummaryResult = {
      ok: false, writeup: null, violations: ["line 1: 9.9 is not in the facts"], warnings: [], attempts: 2, usage: USAGE, model: "m", latencyMs: 1,
    };
    const { pb, deps, calls } = harness({ leagues: [league("L1")] }, { complete: { L1: [1] }, answer: () => refusal });
    for (let pass = 0; pass < 5; pass += 1) await runRoundPass(deps);
    expect(calls).toHaveLength(3);
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "failed", attempts: 3, error: "line 1: 9.9 is not in the facts" });
  });

  it("ends the pass on a quota error, failing only the row it was writing", async () => {
    const { pb, deps, calls } = harness(
      { leagues: [league("L1")] },
      { answer: () => new GeminiQuota("quota exceeded") },
    );
    const report = await runRoundPass(deps);
    expect(calls).toHaveLength(1);
    expect(report.stopped).toMatch(/quota/);
    expect(statuses(pb)).toEqual({ "L1:1": "failed" });
  });
});

describe("runRoundPass — re-guarding (ADR-0013)", () => {
  const checkedLongAgo = { last_guarded_at: stamp(NOW - DAILY_MS - 1) };

  it("leaves prose that still holds, even when the sheet's next-round section moved", async () => {
    const { pb, deps, calls } = harness(
      { leagues: [league("L1")], ai_writeups: [readyRow("L1", 1, checkedLongAgo)] },
      { complete: { L1: [1] }, facts: (_league, round) => factsFor(round, { extra: "NEXT ROUND 2 · unavailable now #P9 (injured)" }) },
    );
    const report = await runRoundPass(deps);
    expect(calls).toEqual([]);
    expect(report.guarded).toBe(1);
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "ready", last_guarded_at: stamp(NOW), output: writeupFor(1) });
  });

  it("rewrites prose a correction made false, in the league's voice now", async () => {
    const { pb, deps, calls } = harness(
      {
        leagues: [league("L1", { enabled: true, voice: "pundit" })],
        ai_writeups: [readyRow("L1", 1, checkedLongAgo)],
      },
      {
        complete: { L1: [1] },
        facts: (_league, round) => factsFor(round, { night: 199 }),
        answer: (round) => ({ ok: true, writeup: writeupFor(round, 199), violations: [], warnings: [], attempts: 1, usage: USAGE, model: "m", latencyMs: 1 }),
      },
    );
    const report = await runRoundPass(deps);
    expect(calls).toEqual([{ round: 1, voice: "pundit" }]);
    expect(report.rewritten).toBe(1);
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "ready", voice: "pundit", output: writeupFor(1, 199) });
  });

  it("waits a day between checks, unless a stat correction landed since the last one", async () => {
    const recent = { last_guarded_at: stamp(NOW - 60 * 60_000) };
    const quiet = harness(
      { leagues: [league("L1")], ai_writeups: [readyRow("L1", 1, recent)] },
      { complete: { L1: [1] }, facts: (_league, round) => factsFor(round, { night: 199 }) },
    );
    expect(await runRoundPass(quiet.deps)).toMatchObject({ guarded: 0, rewritten: 0 });

    const feedBatch = { id: "s1", applied: true, updated_rows: 0, updated: stamp(NOW - 60_000) };
    const fed = harness(
      { leagues: [league("L1")], ai_writeups: [readyRow("L1", 1, recent)], stat_imports: [feedBatch] },
      { complete: { L1: [1] }, facts: (_league, round) => factsFor(round, { night: 199 }) },
    );
    expect(await runRoundPass(fed.deps)).toMatchObject({ guarded: 0, rewritten: 0 });

    const correction = { ...feedBatch, updated_rows: 3 };
    const corrected = harness(
      { leagues: [league("L1")], ai_writeups: [readyRow("L1", 1, recent)], stat_imports: [correction] },
      {
        complete: { L1: [1] },
        facts: (_league, round) => factsFor(round, { night: 199 }),
        answer: (round) => ({ ok: true, writeup: writeupFor(round, 199), violations: [], warnings: [], attempts: 1, usage: USAGE, model: "m", latencyMs: 1 }),
      },
    );
    expect(await runRoundPass(corrected.deps)).toMatchObject({ rewritten: 1 });
  });

  it("writes missing rounds before spending the budget on rewrites", async () => {
    const { deps, calls } = harness(
      { leagues: [league("L1")], ai_writeups: [readyRow("L1", 1, checkedLongAgo)] },
      { complete: { L1: [1, 2, 3] }, facts: (_league, round) => factsFor(round, { night: round === 1 ? 199 : 200 + round }) },
    );
    await runRoundPass(deps);
    expect(calls.map((call) => call.round)).toEqual([2, 3]);
  });
});

describe("writeRequestedRounds", () => {
  it("rewrites a requested round and clears the request", async () => {
    const { pb, deps, calls } = harness({
      leagues: [league("L1")],
      ai_writeups: [readyRow("L1", 2, { rewrite_requested_at: stamp(NOW - 30_000) })],
    });
    expect(await writeRequestedRounds(deps)).toMatchObject({ rewritten: 1 });
    expect(calls).toEqual([{ round: 2, voice: "analyst" }]);
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "ready", rewrite_requested_at: "" });
  });

  it("asks nothing when nothing is requested, and leaves requests in an off league or mid-write", async () => {
    const idle = harness({ leagues: [league("L1")], ai_writeups: [readyRow("L1", 1)] });
    await writeRequestedRounds(idle.deps);
    expect(idle.calls).toEqual([]);

    const requested = { rewrite_requested_at: stamp(NOW - 30_000) };
    const held = harness({
      leagues: [league("L1", { enabled: false, voice: "analyst" }), league("L2")],
      ai_writeups: [
        readyRow("L1", 1, requested),
        readyRow("L2", 1, { ...requested, status: "pending", claimed_at: stamp(NOW - STALE_AFTER_MS + 60_000) }),
      ],
    });
    await writeRequestedRounds(held.deps);
    expect(held.calls).toEqual([]);
    expect(held.pb.rows("ai_writeups").every((row) => row.rewrite_requested_at !== "")).toBe(true);
  });
});
