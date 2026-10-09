import { describe, expect, it } from "vitest";

import { GeminiKeyRefused } from "./gemini";
import type { RoundFacts } from "./round-facts";
import { writeRoundSummary } from "./summary";
import { sectionsIn, summaryAnswer, summaryPrompt, summarySchema, systemRules, writeupEntries } from "./voice";

const facts: RoundFacts = {
  version: 1,
  round: 4,
  text: "META · Euroleague round 4\nNIGHT\n@T1 · 1st of the night · 214.6\n@T2 · 2nd · 206.5\nTABLE SUMMARY · leader @T1\nLABELS\nSTARS (by counted) · #P1 72.6",
  refs: { "@T1": { kind: "member", id: "m1" }, "@T2": { kind: "member", id: "m2" }, "#P1": { kind: "player", id: "p1" } },
  privateNames: ["Einikio Kabliai"],
  numbersByToken: new Map(),
  sharedNumbers: new Set(),
};

function interaction(answer: unknown) {
  return {
    status: "completed",
    model: "gemini-3.5-flash-lite",
    usage: { total_input_tokens: 100, total_output_tokens: 20, total_thought_tokens: 5 },
    steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(answer) }] }],
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

const HEADLINE = "@T1 takes round 4 on #P1's 72.6";
const SECTIONS = {
  stars: "#P1 led the round's stars with 72.6 counted for @T1.",
  table: "@T1 leads the table after round 4.",
};
const answer = (over: Record<string, unknown> = {}) => ({ headline: HEADLINE, lines: GOOD, sections: SECTIONS, ...over });

const run = (doFetch: typeof fetch) =>
  writeRoundSummary({ facts, voice: "analyst", model: "gemini-3.5-flash-lite", apiKey: "k", doFetch, wait: async () => {} });

describe("writeRoundSummary", () => {
  it("returns guarded lines on a clean first answer", async () => {
    const { doFetch } = serving({ status: 200, body: interaction(answer()) });
    const result = await run(doFetch);
    expect(result).toMatchObject({
      ok: true,
      writeup: { headline: HEADLINE, lines: GOOD, sections: SECTIONS },
      attempts: 1,
      model: "gemini-3.5-flash-lite",
    });
    expect(result.usage).toEqual({ inputTokens: 100, outputTokens: 20, thinkingTokens: 5 });
  });

  it("retries once with the faults spelled out, and keeps the corrected answer", async () => {
    const bad = ["@T1 won round 4 by 9.9 fantasy points thanks to #P1.", ...GOOD.slice(1)];
    const { doFetch, prompts } = serving({ status: 200, body: interaction(answer({ lines: bad })) }, { status: 200, body: interaction(answer()) });
    const result = await run(doFetch);
    expect(result).toMatchObject({ ok: true, attempts: 2 });
    expect(prompts[1]).toContain("- line 1: 9.9 is not in the facts");
    expect(result.usage.inputTokens).toBe(200);
  });

  it("gives up after a second refusal rather than keep a wrong answer", async () => {
    const bad = ["Einikio Kabliai won round 4 with 214.6 fantasy points.", ...GOOD.slice(1)];
    const { doFetch } = serving({ status: 200, body: interaction(answer({ lines: bad })) });
    const result = await run(doFetch);
    expect(result).toMatchObject({ ok: false, writeup: null, attempts: 2, violations: ["line 1: wrote a name instead of its token"] });
  });

  it("treats a wrong shape as a refusal it can retry", async () => {
    const { doFetch, prompts } = serving({ status: 200, body: interaction(answer({ lines: ["too short"] })) }, { status: 200, body: interaction(answer()) });
    await expect(run(doFetch)).resolves.toMatchObject({ ok: true, attempts: 2 });
    expect(prompts[1]).toContain("the answer's shape");
  });

  it("guards the headline and every section, not only the lines", async () => {
    const { doFetch, prompts } = serving(
      { status: 200, body: interaction(answer({ headline: "@T1 wins by 9.9 on #P1's night", sections: { ...SECTIONS, stars: "#P9 starred with 72.6 for @T1." } })) },
      { status: 200, body: interaction(answer()) },
    );
    await expect(run(doFetch)).resolves.toMatchObject({ ok: true, attempts: 2 });
    expect(prompts[1]).toContain("- headline: 9.9 is not in the facts");
    expect(prompts[1]).toContain("- stars: #P9 is not in the facts");
  });

  it("refuses a section the sheet has nothing for, and a missing one it does", async () => {
    const extra = answer({ sections: { ...SECTIONS, swing: "@T1 got the better of a deal worth 72.6." } });
    const missing = answer({ sections: { stars: SECTIONS.stars } });
    const { doFetch } = serving({ status: 200, body: interaction(extra) }, { status: 200, body: interaction(missing) });
    const result = await run(doFetch);
    expect(result).toMatchObject({ ok: false, writeup: null });
    expect(result.violations).toEqual(["table: missing; the facts have a section for it"]);
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
    const prompt = summaryPrompt("FACTS HERE", [], ["line 2: 9.9 is not in the facts"]);
    expect(prompt.indexOf("FACTS HERE")).toBeLessThan(prompt.indexOf("Task:"));
    expect(prompt).toMatch(/refused[\s\S]*9\.9 is not in the facts$/);
  });

  it("asks for the same shape the zod accepts", () => {
    const schema = summarySchema(["stars", "table"]);
    expect(schema.properties.lines).toMatchObject({ minItems: 3, maxItems: 5 });
    // The sheet decides the sections, so the schema names exactly those and requires them all:
    // the lite model was seen writing "under" for an OVERPERFORMER line when offered all six.
    expect(schema.properties.sections).toMatchObject({ properties: { stars: { type: "string" }, table: { type: "string" } }, required: ["stars", "table"] });
    expect(Object.keys(schema.properties.sections!.properties)).toEqual(["stars", "table"]);
    expect(summarySchema([]).properties.sections).toBeUndefined();
    expect(summaryAnswer.parse({ headline: HEADLINE, lines: GOOD }).sections).toEqual({});
    const ok = (value: unknown) => summaryAnswer.safeParse(value).success;
    expect(ok(answer())).toBe(true);
    expect(ok(answer({ sections: {} }))).toBe(true);
    expect(ok(answer({ lines: GOOD.slice(0, 2) }))).toBe(false);
    expect(ok(answer({ lines: [...GOOD, ...GOOD] }))).toBe(false);
    expect(ok(answer({ extra: 1 }))).toBe(false);
    expect(ok(answer({ lines: ["@T1 won.\nThen more.", ...GOOD.slice(1)] }))).toBe(false);
    expect(ok(answer({ headline: "x".repeat(19) }))).toBe(false);
    expect(ok(answer({ headline: "x".repeat(20) }))).toBe(true);
    expect(ok(answer({ headline: "x".repeat(90) }))).toBe(true);
    expect(ok(answer({ headline: "x".repeat(91) }))).toBe(false);
    expect(ok(answer({ sections: { stars: "x".repeat(19) } }))).toBe(false);
    expect(ok(answer({ sections: { stars: "x".repeat(300) } }))).toBe(true);
    expect(ok(answer({ sections: { stars: "x".repeat(301) } }))).toBe(false);
    expect(ok(answer({ sections: { gossip: "x".repeat(40) } }))).toBe(false);
  });

  it("offers exactly the sections the sheet has labels for", () => {
    expect(sectionsIn(facts.text)).toEqual(["stars", "table"]);
    const full = [
      "TABLE SUMMARY · leader @T1",
      "STARS (by counted) · #P1 72.6",
      "OVERPERFORMER · #P2 · +12.0 on his average of 8.0",
      "UNDERPERFORMER · #P3 · -9.0 on his average of 14.0 · starter",
      "CAPTAIN FLOP · @T2 captained #P4",
      "BIGGEST SWING · @T1 in #P5, out #P6",
    ].join("\n");
    expect(sectionsIn(full)).toEqual(["stars", "over", "under", "surprises", "table", "swing"]);
    expect(sectionsIn("NEW DEAL · @T1 in #P5 · biggest swing of the round")).toEqual(["swing"]);
    expect(sectionsIn("DID NOT PLAY · #P7")).toEqual(["surprises"]);
    expect(summaryPrompt(facts.text, ["stars", "table"])).toMatch(/sections: stars, table\b/);
    expect(summaryPrompt(facts.text, ["stars", "table"])).toContain('"sections": {"stars": "...", "table": "..."}');
    expect(summaryPrompt(facts.text, [])).not.toContain('"sections"');
  });

  it("lays a write-up out as labelled entries in reading order", () => {
    expect(writeupEntries({ headline: HEADLINE, lines: GOOD, sections: { table: "t", stars: "s" } })).toEqual([
      { label: "headline", text: HEADLINE },
      { label: "line 1", text: GOOD[0] },
      { label: "line 2", text: GOOD[1] },
      { label: "line 3", text: GOOD[2] },
      { label: "stars", text: "s" },
      { label: "table", text: "t" },
    ]);
  });
});
