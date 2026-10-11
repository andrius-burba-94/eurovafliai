import { describe, expect, it } from "vitest";

import { briefSheet as sheet } from "../../../tests/unit/helpers/brief-sheet";

import { GeminiNoAnswer, GeminiQuota, type GeminiAnswer, type GeminiRequest } from "./gemini";
import { briefRefs, storedBrief, writeBriefs, type BriefLines } from "./briefs";

const USAGE = { inputTokens: 10, outputTokens: 5, thinkingTokens: 0 };

const GOOD: Record<string, BriefLines> = {
  "@T1": {
    result: "You won the night with 180.0 fantasy points, and #P1's captaincy added +25.0 of them.",
    standing: "You lead @T2 by 20.0 fantasy points at the top of the table.",
    next: "Round 6 looks kind, with 2 easy games and 1 even.",
  },
  "@T2": {
    result: "You held the night on 100.0 fantasy points, though #P2 lost you 5.0 on the bench.",
    standing: "You sit 20.0 behind @T1 and 80.0 ahead of @T3.",
    next: "Round 6 is mixed: 1 easy, 1 even and 1 hard game.",
  },
  "@T3": {
    result: "You lost the night on 40.0 fantasy points, with nothing going your way.",
    standing: "You trail @T2 by 80.0 fantasy points.",
    next: "The Scout likes dropping #P3 for #P9, worth +4.2 fantasy points a game.",
  },
};

const answer = (value: unknown): GeminiAnswer => ({ value, text: JSON.stringify(value), usage: USAGE, model: "m-1", latencyMs: 1 });

function recorder(answers: unknown[]) {
  const asked: GeminiRequest[] = [];
  const ask = async (request: GeminiRequest) => {
    asked.push(request);
    const next = answers.shift();
    if (next instanceof Error) throw next;
    return answer(next);
  };
  return { asked, ask };
}

describe("writeBriefs", () => {
  it("asks once for every member, keyed by team token, in the league's voice", async () => {
    const { asked, ask } = recorder([GOOD]);
    const result = await writeBriefs({ facts: sheet(), voice: "pundit", model: "m", apiKey: "k", ask });

    expect(asked).toHaveLength(1);
    expect(asked[0]!.system).toMatch(/witty pundit/);
    expect(Object.keys((asked[0]!.schema as { properties: object }).properties)).toEqual(["@T1", "@T2", "@T3"]);
    expect(result.calls).toBe(1);
    expect(result.byMember.m1).toEqual({ ok: true, brief: GOOD["@T1"] });
    expect(result.byMember.m3).toEqual({ ok: true, brief: GOOD["@T3"] });
  });

  it("asks only for the members it is given, with only their sections", async () => {
    const { asked, ask } = recorder([{ "@T2": GOOD["@T2"] }]);
    const result = await writeBriefs({ facts: sheet(), memberIds: ["m2"], voice: "analyst", model: "m", apiKey: "k", ask });

    expect(Object.keys(result.byMember)).toEqual(["m2"]);
    expect(asked[0]!.prompt).toContain("TEAM @T2");
    expect(asked[0]!.prompt).not.toContain("TEAM @T1");
    expect(asked[0]!.prompt).not.toContain("#P9");
  });

  it("guards each member against the table and their own section only", async () => {
    // @T1 cites @T3's private move: its token and its gain are on no line @T1 may use.
    const leaky = { ...GOOD, "@T1": { ...GOOD["@T1"]!, next: "Like @T3, you could add #P9 for +4.2 fantasy points a game." } };
    const { asked, ask } = recorder([leaky, { "@T1": leaky["@T1"] }]);
    const result = await writeBriefs({ facts: sheet(), voice: "analyst", model: "m", apiKey: "k", ask });

    expect(result.byMember.m1).toEqual({
      ok: false,
      violations: ["@T1 next: #P9 is not in the facts", "@T1 next: 4.2 is not in the facts"],
    });
    expect(result.byMember.m2).toEqual({ ok: true, brief: GOOD["@T2"] });
    expect(result.byMember.m3).toEqual({ ok: true, brief: GOOD["@T3"] });
    expect(asked).toHaveLength(2);
  });

  it("retries only the refused members, listing their faults, and keeps a fixed answer", async () => {
    const wrong = { ...GOOD, "@T2": { ...GOOD["@T2"]!, standing: "You sit 21.0 behind @T1." } };
    const { asked, ask } = recorder([wrong, { "@T2": GOOD["@T2"] }]);
    const result = await writeBriefs({ facts: sheet(), voice: "analyst", model: "m", apiKey: "k", ask });

    expect(asked).toHaveLength(2);
    expect(Object.keys((asked[1]!.schema as { properties: object }).properties)).toEqual(["@T2"]);
    expect(asked[1]!.prompt).toContain("- @T2 standing: 21 is not in the facts");
    expect(asked[1]!.prompt).not.toContain("TEAM @T1");
    expect(result.calls).toBe(2);
    expect(result.usage).toEqual({ inputTokens: 20, outputTokens: 10, thinkingTokens: 0 });
    expect(Object.values(result.byMember).every((outcome) => outcome.ok)).toBe(true);
  });

  it("holds every line to one sentence and asks again for a missing member", async () => {
    const { ask } = recorder([
      { "@T1": { ...GOOD["@T1"]!, standing: "You lead @T2. By 20.0 fantasy points." }, "@T2": GOOD["@T2"] },
      { "@T1": GOOD["@T1"], "@T3": { result: "Short.", standing: GOOD["@T3"]!.standing, next: GOOD["@T3"]!.next } },
    ]);
    const result = await writeBriefs({ facts: sheet(), voice: "analyst", model: "m", apiKey: "k", ask });

    expect(result.byMember.m1).toEqual({ ok: true, brief: GOOD["@T1"] });
    expect(result.byMember.m3).toMatchObject({ ok: false });
    expect((result.byMember.m3 as { violations: readonly string[] }).violations[0]).toMatch(/^@T3 result: /);
  });

  it("treats an unusable answer as a refusal to retry, and lets a quota error through", async () => {
    const { ask } = recorder([new GeminiNoAnswer("Gemini gave no usable answer (no JSON)"), GOOD]);
    const result = await writeBriefs({ facts: sheet(), voice: "analyst", model: "m", apiKey: "k", ask });
    expect(Object.values(result.byMember).every((outcome) => outcome.ok)).toBe(true);

    const quota = recorder([new GeminiQuota("429")]);
    await expect(writeBriefs({ facts: sheet(), voice: "analyst", model: "m", apiKey: "k", ask: quota.ask })).rejects.toThrow(GeminiQuota);
  });
});

describe("briefRefs", () => {
  it("holds the table's tokens and the member's own, never another member's private ones", () => {
    expect(Object.keys(briefRefs(sheet(), "m1")).sort()).toEqual(["#P1", "@T1", "@T2", "@T3"]);
    expect(Object.keys(briefRefs(sheet(), "m3")).sort()).toEqual(["#P3", "#P9", "@T1", "@T2", "@T3"]);
  });
});

describe("storedBrief", () => {
  it("reads three named lines and nothing else", () => {
    expect(storedBrief(GOOD["@T1"])).toEqual(GOOD["@T1"]);
    expect(storedBrief({ result: "x", standing: "y" })).toBeNull();
    expect(storedBrief({ headline: "a round write-up" })).toBeNull();
  });
});
