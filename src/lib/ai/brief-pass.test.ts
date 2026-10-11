import { describe, expect, it } from "vitest";

import { briefSheet } from "../../../tests/unit/helpers/brief-sheet";
import { fakePb, type FakeDb, type FakeRecord } from "../../../tests/unit/helpers/fake-pb";

import type { BriefFacts } from "./brief-facts";
import { runBriefPass, writeRequestedBriefs, type BriefPassDeps } from "./brief-pass";
import type { BriefLines, BriefsResult } from "./briefs";
import { GeminiQuota } from "./gemini";
import { STALE_AFTER_MS } from "./store";
import { DAILY_MS } from "./round-pass";
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
  const pb = fakePb({ data: { ai_writeups: [], stat_imports: [], league_members: [...members("L1"), ...members("L2"), ...members("L3")], ...data } });
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

/** A brief stored for round 2, citing its sheet: m1 the night's 180.0 and the 20.0 lead, m2 the 80.0 over @T3. */
const STORED: Record<string, BriefLines> = {
  m1: {
    result: "You won the night with 180.0 fantasy points, and #P1's captaincy added +25.0.",
    standing: "You lead @T2 by 20.0 fantasy points at the top.",
    next: "Round 6 looks kind, with 2 easy games and 1 even.",
  },
  m2: {
    result: "You held the night, though #P2 lost you 5.0 on the bench.",
    standing: "You sit 80.0 fantasy points clear of @T3.",
    next: "Round 6 is mixed: 1 easy, 1 even and 1 hard game.",
  },
  m3: {
    result: "You lost the night, with nothing going your way.",
    standing: "You sit behind @T2 in the table for now.",
    next: "The Scout likes a swap for the round ahead.",
  },
};

function storedRow(member: string, over: Record<string, unknown> = {}): FakeRecord {
  return {
    id: `b-L1${member}`,
    league: "L1",
    season: "E2026",
    round: 2,
    kind: "round_brief",
    member: `L1${member}`,
    status: "ready",
    voice: "analyst",
    input_hash: "h".repeat(64),
    attempts: 1,
    output: STORED[member],
    generated_at: stamp(NOW - DAILY_MS - 60_000),
    last_guarded_at: "",
    rewrite_requested_at: "",
    ...over,
  };
}

/** Round 2's sheet rebuilt, with an edit to the table and to m2's own section. */
const rebuilt = (edit: (text: string) => string) => (leagueId: string, round: number): BriefFacts => {
  const base = sheetFor(leagueId, round);
  return { ...base, header: edit(base.header), sectionFor: (id) => (id.endsWith("m2") ? edit(base.sectionFor(id)) : base.sectionFor(id)) };
};

describe("runBriefPass: the re-guard (7.3 E)", () => {
  const all = (over: Record<string, unknown> = {}) => ["m1", "m2", "m3"].map((member) => storedRow(member, over));
  const written = () => ({ leagues: [league("L1", { enabled: true, voice: "pundit" })], ai_writeups: all() });

  it("marks a brief that still holds, and rewrites whole, in today's voice, one a correction made false", async () => {
    // The correction moves the gap over @T3 from 80.0 to 81.0: m2's standing no longer holds; m1's never cited it.
    const { pb, deps, calls, reads } = harness(written(), { complete: { L1: [2] }, facts: rebuilt((text) => text.replaceAll("80.0", "81.0")) });

    const report = await runBriefPass(deps);

    expect(reads).toEqual(["L1:2"]);
    expect(calls).toEqual([{ league: "L1", round: 2, members: ["L1m2"], voice: "pundit" }]);
    expect(report).toMatchObject({ guarded: 2, rewritten: 1, calls: 1 });
    const [m1, m2] = pb.rows("ai_writeups");
    expect(m1).toMatchObject({ status: "ready", output: STORED.m1, last_guarded_at: stamp(NOW) });
    expect(m2).toMatchObject({ status: "ready", output: brief("L1m2"), voice: "pundit" });
  });

  it("rewrites nothing when only the next round moved: the next line is a forecast as of writing", async () => {
    const { pb, deps, calls } = harness(written(), {
      complete: { L1: [2] },
      facts: rebuilt((text) => text.replace("1 easy, 1 even, 1 hard", "0 easy, 0 even, 3 hard")),
    });
    expect(await runBriefPass(deps)).toMatchObject({ guarded: 3, rewritten: 0, calls: 0 });
    expect(calls).toEqual([]);
    expect(pb.rows("ai_writeups").map((row) => row.output)).toEqual([STORED.m1, STORED.m2, STORED.m3]);
  });

  it("checks a brief again only after a day, or once a stat correction has landed since", async () => {
    const recent = { last_guarded_at: stamp(NOW - 60 * 60_000) };
    const quiet = harness({ leagues: [league("L1")], ai_writeups: all(recent) }, { complete: { L1: [2] } });
    expect(await runBriefPass(quiet.deps)).toMatchObject({ guarded: 0 });
    expect(quiet.reads).toEqual([]);

    const corrected = harness(
      {
        leagues: [league("L1")],
        ai_writeups: all(recent),
        stat_imports: [{ id: "i1", applied: true, updated_rows: 4, updated: stamp(NOW - 10 * 60_000) }],
      },
      { complete: { L1: [2] }, facts: rebuilt((text) => text.replaceAll("80.0", "81.0")) },
    );
    expect(await runBriefPass(corrected.deps)).toMatchObject({ guarded: 2, rewritten: 1 });
  });

  it("leaves a false brief unmarked when the pass has no call left, so the next pass rewrites it", async () => {
    const { pb, deps, calls } = harness(written(), { complete: { L1: [2] }, budget: 0, facts: rebuilt((text) => text.replaceAll("80.0", "81.0")) });
    expect(await runBriefPass(deps)).toMatchObject({ guarded: 2, rewritten: 0, calls: 0 });
    expect(calls).toEqual([]);
    expect(pb.rows("ai_writeups")[1]).toMatchObject({ status: "ready", last_guarded_at: "" });
  });

  it("re-guards only briefs that are written: a failed or pending row is not the re-guard's", async () => {
    const { deps, reads } = harness(
      { leagues: [league("L1")], ai_writeups: [storedRow("m1", { status: "failed" }), storedRow("m2", { status: "pending", claimed_at: stamp(NOW - 60_000) })] },
      { complete: { L1: [2] }, facts: () => null },
    );
    expect(await runBriefPass(deps)).toMatchObject({ guarded: 0, rewritten: 0 });
    // The latest round's write step reads it for the failed row; the re-guard adds nothing.
    expect(reads).toEqual(["L1:2"]);
  });
});

describe("writeRequestedBriefs", () => {
  const requested = { rewrite_requested_at: stamp(NOW - 30_000) };

  it("rewrites a round's requested briefs in one call, in today's voice, and answers the requests", async () => {
    const { pb, deps, calls } = harness(
      { leagues: [league("L1", { enabled: true, voice: "pundit" })], ai_writeups: [storedRow("m1", requested), storedRow("m2", requested)] },
      { complete: { L1: [2, 3] } },
    );
    expect(await writeRequestedBriefs(deps)).toMatchObject({ rewritten: 2, calls: 1 });
    expect(calls).toEqual([{ league: "L1", round: 2, members: ["L1m1", "L1m2"], voice: "pundit" }]);
    expect(pb.rows("ai_writeups").map((row) => [row.status, row.rewrite_requested_at])).toEqual([
      ["ready", ""],
      ["ready", ""],
    ]);
  });

  it("takes a request over once a crashed claim goes stale, and leaves a fresh one to its writer", async () => {
    const { pb, deps, calls } = harness({
      leagues: [league("L1")],
      ai_writeups: [
        storedRow("m1", { ...requested, status: "pending", claimed_at: stamp(NOW - 60_000) }),
        storedRow("m2", { ...requested, status: "pending", claimed_at: stamp(NOW - STALE_AFTER_MS - 1) }),
      ],
    });
    await writeRequestedBriefs(deps);
    expect(calls.map((call) => call.members)).toEqual([["L1m2"]]);
    expect(pb.rows("ai_writeups").map((row) => [row.status, row.rewrite_requested_at !== ""])).toEqual([
      ["pending", true],
      ["ready", false],
    ]);
  });

  it("keeps a brief readable and its request standing when Google does not answer", async () => {
    const { pb, deps } = harness(
      { leagues: [league("L1")], ai_writeups: [storedRow("m1", requested), storedRow("m2", requested)] },
      { answer: () => new GeminiQuota("429") },
    );
    expect((await writeRequestedBriefs(deps)).stopped).toContain("quota");
    expect(pb.rows("ai_writeups").map((row) => [row.status, row.output, row.rewrite_requested_at !== ""])).toEqual([
      ["ready", STORED.m1, true],
      ["ready", STORED.m2, true],
    ]);
  });

  it("leaves requests standing in a league with write-ups off, and asks nothing without one", async () => {
    const off = harness({ leagues: [league("L1", { enabled: false, voice: "analyst" })], ai_writeups: [storedRow("m1", requested)] });
    expect(await writeRequestedBriefs(off.deps)).toMatchObject({ calls: 0 });
    expect(off.pb.rows("ai_writeups")[0]!.rewrite_requested_at).not.toBe("");

    const idle = harness({ leagues: [league("L1")], ai_writeups: [storedRow("m1")] });
    expect(await writeRequestedBriefs(idle.deps)).toMatchObject({ calls: 0 });
    expect(idle.reads).toEqual([]);
  });
});
