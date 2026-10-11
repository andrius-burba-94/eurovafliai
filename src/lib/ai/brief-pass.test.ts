import { describe, expect, it } from "vitest";

import { briefSheet } from "../../../tests/unit/helpers/brief-sheet";
import { fakePb, type FakeDb, type FakeRecord } from "../../../tests/unit/helpers/fake-pb";

import type { BriefFacts } from "./brief-facts";
import { runBriefPass, type BriefPassDeps } from "./brief-pass";
import type { BriefLines, BriefsResult } from "./briefs";
import { GeminiQuota } from "./gemini";
import { STALE_AFTER_MS } from "./store";
import type { Voice } from "./voice";

const NOW = Date.parse("2026-10-11T12:00:00Z");
const stamp = (ms: number) => new Date(ms).toISOString().replace("T", " ");
const USAGE = { inputTokens: 10, outputTokens: 5, thinkingTokens: 0 };

const brief = (memberId: string): BriefLines => ({
  result: `The night for ${memberId}, in one sentence.`,
  standing: `Where ${memberId} stands, in one sentence.`,
  next: `What comes next for ${memberId}, in one sentence.`,
});

const answerFor = (memberIds: readonly string[], refused: readonly string[] = []): BriefsResult => ({
  byMember: Object.fromEntries(
    memberIds.map((memberId) => [
      memberId,
      refused.includes(memberId) ? { ok: false as const, violations: ["@T2 standing: 21 is not in the facts"] } : { ok: true as const, brief: brief(memberId) },
    ]),
  ),
  usage: USAGE,
  model: "m",
  calls: refused.length > 0 ? 2 : 1,
});

const league = (id: string, ai?: unknown): FakeRecord => ({ id, status: "season", settings: ai === undefined ? {} : { ai } });
const members = (leagueId: string): FakeRecord[] => ["m1", "m2", "m3"].map((id) => ({ id: `${leagueId}${id}`, league: leagueId }));

/** The shared sheet, with the league's member ids. */
function sheetFor(leagueId: string, round: number): BriefFacts {
  const base = briefSheet();
  const local = (memberId: string) => memberId.slice(leagueId.length);
  return {
    ...base,
    round,
    refs: Object.fromEntries(Object.entries(base.refs).map(([token, ref]) => [token, ref.kind === "member" ? { ...ref, id: `${leagueId}${ref.id}` } : ref])),
    memberIds: base.memberIds.map((memberId) => `${leagueId}${memberId}`),
    sectionFor: (memberId) => base.sectionFor(local(memberId)),
    tokensFor: (memberId) => base.tokensFor(local(memberId)),
  };
}

type Call = { league: string; round: number; members: string[]; voice: Voice };

function harness(
  data: FakeDb,
  {
    complete = { L1: [1, 2, 3] } as Record<string, number[]>,
    facts = (leagueId: string, round: number): BriefFacts | null => sheetFor(leagueId, round),
    answer = (memberIds: readonly string[]): BriefsResult | Error => answerFor(memberIds),
    apiKey = "k",
    budget = 2,
    now = NOW,
  } = {},
) {
  const pb = fakePb({ data: { ai_writeups: [], league_members: [...members("L1"), ...members("L2"), ...members("L3")], ...data } });
  const calls: Call[] = [];
  const reads: string[] = [];
  const deps: BriefPassDeps = {
    pb: pb.client,
    season: "E2026",
    apiKey,
    model: "m",
    now: () => now,
    budget,
    readComplete: async (leagueId) => complete[leagueId] ?? [],
    readFacts: async (leagueId, round) => {
      reads.push(`${leagueId}:${round}`);
      return facts(leagueId, round);
    },
    write: async ({ facts: sheet, memberIds, voice }) => {
      const asked = [...(memberIds ?? sheet.memberIds)];
      calls.push({ league: asked[0]!.slice(0, 2), round: sheet.round, members: asked, voice });
      const result = answer(asked);
      if (result instanceof Error) throw result;
      return result;
    },
  };
  return { pb, deps, calls, reads };
}

const rowsOf = (pb: ReturnType<typeof fakePb>) =>
  pb.rows("ai_writeups").map((row) => [row.member, row.round, row.kind, row.status]);

describe("runBriefPass", () => {
  it("writes one private row per member with one call per league, for the latest finished round only", async () => {
    const { pb, deps, calls, reads } = harness({ leagues: [league("L1", { enabled: true, voice: "pundit" })] });

    const report = await runBriefPass(deps);

    expect(reads).toEqual(["L1:3"]);
    expect(calls).toEqual([{ league: "L1", round: 3, members: ["L1m1", "L1m2", "L1m3"], voice: "pundit" }]);
    expect(report).toMatchObject({ written: 3, refused: 0, calls: 1, stopped: null });
    expect(rowsOf(pb)).toEqual([
      ["L1m1", 3, "round_brief", "ready"],
      ["L1m2", 3, "round_brief", "ready"],
      ["L1m3", 3, "round_brief", "ready"],
    ]);
    const first = pb.rows("ai_writeups")[0]!;
    expect(first).toMatchObject({ voice: "pundit", output: brief("L1m1") });
    expect(Object.keys(first.output as object)).toEqual(["result", "standing", "next"]);
  });

  it("stores only the table's tokens and the member's own, never another member's private ones", async () => {
    const { pb, deps } = harness({ leagues: [league("L1")] });
    await runBriefPass(deps);
    const refsOf = (member: string) => Object.keys(pb.rows("ai_writeups").find((row) => row.member === member)!.refs as object).sort();
    // #P9 is the move worth making in m3's section alone.
    expect(refsOf("L1m1")).toEqual(["#P1", "@T1", "@T2", "@T3"]);
    expect(refsOf("L1m2")).toEqual(["#P2", "@T1", "@T2", "@T3"]);
    expect(refsOf("L1m3")).toEqual(["#P3", "#P9", "@T1", "@T2", "@T3"]);
  });

  it("asks nothing, and reads no sheet, once every member's brief is written", async () => {
    const { deps, calls, reads } = harness({ leagues: [league("L1")] });
    await runBriefPass(deps);
    expect(await runBriefPass(deps)).toMatchObject({ calls: 0 });
    expect(calls).toHaveLength(1);
    expect(reads).toEqual(["L1:3"]);
  });

  it("reads no sheet for a league whose unwritten briefs are out of attempts", async () => {
    const { pb, deps, calls, reads } = harness({ leagues: [league("L1")] }, { answer: (memberIds) => answerFor(memberIds, ["L1m2"]) });
    for (let pass = 0; pass < 5; pass += 1) await runBriefPass(deps);
    expect(calls.map((call) => call.members)).toEqual([["L1m1", "L1m2", "L1m3"], ["L1m2"], ["L1m2"]]);
    expect(reads).toHaveLength(3);
    expect(pb.rows("ai_writeups")[1]).toMatchObject({ status: "failed", attempts: 3 });
  });

  it("makes no call and writes no brief with write-ups off or without a key", async () => {
    const off = harness({ leagues: [league("L1", { enabled: false, voice: "analyst" })] });
    expect((await runBriefPass(off.deps)).calls).toBe(0);
    expect(off.calls).toEqual([]);
    expect(off.pb.rows("ai_writeups")).toEqual([]);

    const keyless = harness({ leagues: [league("L1")] }, { apiKey: "" });
    expect(await runBriefPass(keyless.deps)).toMatchObject({ calls: 0, stopped: "no GEMINI_API_KEY" });
    expect(keyless.calls).toEqual([]);
    expect(keyless.pb.rows("ai_writeups")).toEqual([]);
  });

  it("skips a league before its first finished round, and a round the reader refuses", async () => {
    const early = harness({ leagues: [league("L1")] }, { complete: {} });
    expect((await runBriefPass(early.deps)).calls).toBe(0);
    const refused = harness({ leagues: [league("L1")] }, { facts: () => null });
    expect((await runBriefPass(refused.deps)).calls).toBe(0);
    expect(refused.pb.rows("ai_writeups")).toEqual([]);
  });

  it("fails a member refused twice and stores the others, then asks again for that member alone", async () => {
    const { pb, deps, calls } = harness({ leagues: [league("L1")] }, { answer: (memberIds) => answerFor(memberIds, ["L1m2"]) });
    const report = await runBriefPass(deps);
    expect(report).toMatchObject({ written: 2, refused: 1, calls: 1 });
    expect(rowsOf(pb).map((row) => row[3])).toEqual(["ready", "failed", "ready"]);
    expect(pb.rows("ai_writeups")[1]).toMatchObject({ error: "@T2 standing: 21 is not in the facts", tokens_in: 10 });

    await runBriefPass({ ...deps, write: async (args) => { calls.push({ league: "L1", round: 3, members: [...args.memberIds!], voice: args.voice }); return answerFor(args.memberIds!); } });
    expect(calls[1]!.members).toEqual(["L1m2"]);
    expect(rowsOf(pb).map((row) => row[3])).toEqual(["ready", "ready", "ready"]);
  });

  it("holds to its share of the shared cap across leagues", async () => {
    const { deps, calls } = harness({ leagues: [league("L1"), league("L2"), league("L3")] }, { complete: { L1: [3], L2: [3], L3: [3] }, budget: 2 });
    expect((await runBriefPass(deps)).calls).toBe(2);
    expect(calls.map((call) => call.league)).toEqual(["L1", "L2"]);
    expect((await runBriefPass({ ...deps, budget: 0 })).calls).toBe(0);
  });

  it("fails the claimed rows and ends the pass when Google says not now", async () => {
    const { pb, deps, calls } = harness({ leagues: [league("L1"), league("L2")] }, { complete: { L1: [3], L2: [3] }, answer: () => new GeminiQuota("429") });
    const report = await runBriefPass(deps);
    expect(report.stopped).toContain("quota");
    expect(calls).toHaveLength(1);
    expect(pb.rows("ai_writeups").every((row) => row.status === "failed" && row.league === "L1")).toBe(true);
  });

  it("leaves a fresh claim to its writer and takes over a stale one", async () => {
    const pending = (member: string, claimedAt: number): FakeRecord => ({
      id: `w-${member}`,
      league: "L1",
      season: "E2026",
      round: 3,
      kind: "round_brief",
      member,
      status: "pending",
      voice: "analyst",
      input_hash: "h".repeat(64),
      attempts: 1,
      claimed_at: stamp(claimedAt),
    });
    const { pb, deps, calls } = harness({
      leagues: [league("L1")],
      ai_writeups: [pending("L1m1", NOW - 60_000), pending("L1m2", NOW - STALE_AFTER_MS - 1)],
    });
    await runBriefPass(deps);
    expect(calls.map((call) => call.members)).toEqual([["L1m2", "L1m3"]]);
    expect(rowsOf(pb).map((row) => [row[0], row[3]])).toEqual([
      ["L1m1", "pending"],
      ["L1m2", "ready"],
      ["L1m3", "ready"],
    ]);
  });
});
