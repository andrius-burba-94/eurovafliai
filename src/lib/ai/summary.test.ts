import { describe, expect, it } from "vitest";

import { GeminiKeyRefused } from "./gemini";
import type { RoundFacts } from "./round-facts";
import { writeRoundSummary } from "./summary";
import { summaryAnswer, SUMMARY_SCHEMA, summaryPrompt, systemRules } from "./voice";

const facts: RoundFacts = {
  version: 1,
  round: 4,
  text: "META · Euroleague round 4\nNIGHT\n@T1 · 1st of the night · 214.6\n@T2 · 2nd · 206.5\nSTARS (by counted) · #P1 72.6",
  refs: { "@T1": { kind: "member", id: "m1" }, "@T2": { kind: "member", id: "m2" }, "#P1": { kind: "player", id: "p1" } },
  privateNames: ["Einikio Kabliai"],
  numbersByToken: new Map(),
  sharedNumbers: new Set(),
};

function interaction(lines: unknown) {
  return {
    status: "completed",
    model: "gemini-3.5-flash-lite",
    usage: { total_input_tokens: 100, total_output_tokens: 20, total_thought_tokens: 5 },
    steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify({ lines }) }] }],
  };
}

function serving(...bodies: { status: number; body: unknown }[]) {
  const prompts: string[] = [];
  const doFetch = (async (_url: string, init: RequestInit) => {
    prompts.push(JSON.parse(String(init.body)).input);
    const reply = bodies[Math.min(prompts.length - 1, bodies.length - 1)]!;
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  }) as typeof fetch;
  return { doFetch, prompts };
}

const GOOD = [
  "@T1 won round 4 with 214.6 fantasy points, carried by #P1.",
  "#P1's 72.6 counted was the night of the round.",
  "@T2 finished close behind on 206.5 fantasy points.",
];

const run = (doFetch: typeof fetch) =>
  writeRoundSummary({ facts, voice: "analyst", model: "gemini-3.5-flash-lite", apiKey: "k", doFetch, wait: async () => {} });

describe("writeRoundSummary", () => {
  it("returns guarded lines on a clean first answer", async () => {
    const { doFetch } = serving({ status: 200, body: interaction(GOOD) });
    const result = await run(doFetch);
    expect(result).toMatchObject({ ok: true, lines: GOOD, attempts: 1, model: "gemini-3.5-flash-lite" });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20, thinkingTokens: 5 });
  });

  it("retries once with the faults spelled out, and keeps the corrected answer", async () => {
    const bad = ["@T1 won round 4 by 9.9 fantasy points thanks to #P1.", ...GOOD.slice(1)];
    const { doFetch, prompts } = serving({ status: 200, body: interaction(bad) }, { status: 200, body: interaction(GOOD) });
    const result = await run(doFetch);
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(prompts[1]).toContain("- line 1: 9.9 is not in the facts");
    expect(result.usage.inputTokens).toBe(200);
  });

  it("gives up after a second refusal rather than keep a wrong answer", async () => {
    const bad = ["Einikio Kabliai won round 4 with 214.6 fantasy points.", ...GOOD.slice(1)];
    const { doFetch } = serving({ status: 200, body: interaction(bad) });
    const result = await run(doFetch);
    expect(result).toMatchObject({ ok: false, lines: [], attempts: 2, violations: ["line 1: wrote a name instead of its token"] });
  });

  it("treats a wrong shape as a refusal it can retry", async () => {
    const { doFetch, prompts } = serving({ status: 200, body: interaction(["too short"]) }, { status: 200, body: interaction(GOOD) });
    await expect(run(doFetch)).resolves.toMatchObject({ ok: true, attempts: 2 });
    expect(prompts[1]).toContain("the answer's shape");
  });

  it("lets a refused key through to the caller", async () => {
    const { doFetch } = serving({ status: 401, body: {} });
    await expect(run(doFetch)).rejects.toBeInstanceOf(GeminiKeyRefused);
  });
});

describe("voice", () => {
  it("tells both voices the guard's rules", () => {
    for (const voice of ["analyst", "pundit"] as const) {
      const rules = systemRules(voice);
      expect(rules).toContain("@T3");
      expect(rules).toContain("as digits");
      expect(rules).toContain('Never put "a" or "an" before a token');
      expect(rules).toContain('"fantasy points"');
    }
    expect(systemRules("pundit")).not.toBe(systemRules("analyst"));
  });

  it("puts the facts before the task, and the faults after it on a retry", () => {
    const prompt = summaryPrompt("FACTS HERE", ["line 2: 9.9 is not in the facts"]);
    expect(prompt.indexOf("FACTS HERE")).toBeLessThan(prompt.indexOf("Task:"));
    expect(prompt).toMatch(/refused[\s\S]*9\.9 is not in the facts$/);
  });

  it("asks for the same shape the zod accepts", () => {
    expect(SUMMARY_SCHEMA.properties.lines.minItems).toBe(3);
    expect(SUMMARY_SCHEMA.properties.lines.maxItems).toBe(5);
    expect(summaryAnswer.safeParse({ lines: GOOD }).success).toBe(true);
    expect(summaryAnswer.safeParse({ lines: GOOD.slice(0, 2) }).success).toBe(false);
    expect(summaryAnswer.safeParse({ lines: [...GOOD, ...GOOD] }).success).toBe(false);
    expect(summaryAnswer.safeParse({ lines: GOOD, extra: 1 }).success).toBe(false);
    expect(summaryAnswer.safeParse({ lines: ["@T1 won.\nThen more.", ...GOOD.slice(1)] }).success).toBe(false);
  });
});
