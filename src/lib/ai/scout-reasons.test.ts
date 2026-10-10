import { describe, expect, it } from "vitest";

import type { ScoutMove } from "@/lib/advisor/scout";
import type { WireRow } from "@/lib/advisor/wire";

import { buildScoutFacts } from "./scout-facts";
import { reasonsPrompt, reasonsStillHold, writeScoutReasons, type Ask } from "./scout-reasons";

function player(id: string, name: string, five: number): WireRow {
  return {
    id,
    name,
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
const move = (drop: WireRow, add: WireRow, gain: number): ScoutMove => ({ drop, add, gain, confidence: "medium" });

const facts = buildScoutFacts({
  ruleset: "euroleague",
  members: [
    { memberId: "m1", moves: [move(player("obst", "Obst, Andreas", 960), player("fra", "Francisco, Sylvain", 1380), 420)] },
    { memberId: "m2", moves: [move(player("luc", "Lucic, Vladimir", 890), player("mas", "Massa, Bodian", 1250), 360)] },
  ],
  privateNames: ["Andreas Obst", "Sylvain Francisco"],
});
const t = (id: string) => facts.tokens.get(id)!;
const usage = { inputTokens: 10, outputTokens: 5, thinkingTokens: 0 };

/** Answers from a script, one per call, and records the prompts asked. */
function scripted(...answers: Record<string, string>[]): Ask & { prompts: string[] } {
  const prompts: string[] = [];
  const ask = (async (request) => {
    prompts.push(request.prompt);
    const value = answers.shift();
    if (!value) throw new Error("no more answers");
    return { value, text: JSON.stringify(value), usage, model: "gemini-test", latencyMs: 5 };
  }) as Ask & { prompts: string[] };
  ask.prompts = prompts;
  return ask;
}

const good = {
  M1: `${t("fra")} has started 4 of his last 5 and is worth 13.8 fantasy points a game over the next 5. The gain is +4.2 a game while ${t("obst")} comes off a 9.6 run.`,
  M2: `${t("mas")} has started 4 of his last 5 and is worth 12.5 fantasy points a game over the next 5. The gain is +3.6 while ${t("luc")} sits at 8.9.`,
};

describe("writeScoutReasons", () => {
  it("writes two sentences a move and keeps them per member", async () => {
    const ask = scripted(good);
    const result = await writeScoutReasons({ facts, model: "gemini-test", apiKey: "k", ask });
    expect(result.byMember.m1).toEqual({ ok: true, reasons: { "obst|fra": good.M1 } });
    expect(result.byMember.m2).toEqual({ ok: true, reasons: { "luc|mas": good.M2 } });
    expect(result.calls).toBe(1);
  });

  it("refuses a reason that cites another member's move, and asks again for that move only", async () => {
    const leaky = { ...good, M1: `${t("fra")} has started 4 of his last 5 and is worth 13.8 fantasy points a game. Unlike ${t("mas")}, the gain is +4.2 a game.` };
    const fixed = { M1: good.M1 };
    const ask = scripted(leaky, fixed);
    const result = await writeScoutReasons({ facts, model: "gemini-test", apiKey: "k", ask });
    expect(result.byMember.m1).toEqual({ ok: true, reasons: { "obst|fra": good.M1 } });
    expect(result.byMember.m2!.ok).toBe(true);
    expect(ask.prompts[1]).toContain("M1:");
    expect(ask.prompts[1]).toContain(`${t("mas")} is not in the facts`);
    // The retry carries only the member with a fault, never the rest of the league.
    expect(ask.prompts[1]).not.toContain(t("luc"));
  });

  it("fails a member's row when the second answer is refused too, and keeps the others", async () => {
    const wrong = { ...good, M2: `${t("mas")} is worth 99.9 fantasy points a game over the next 5. That is a big gain for this team.` };
    const ask = scripted(wrong, { M2: wrong.M2 });
    const result = await writeScoutReasons({ facts, model: "gemini-test", apiKey: "k", ask });
    expect(result.byMember.m1!.ok).toBe(true);
    expect(result.byMember.m2).toMatchObject({ ok: false });
    expect(result.byMember.m2!.ok === false && result.byMember.m2!.violations.join(" ")).toContain("99.9 is not in the facts");
    expect(result.calls).toBe(2);
  });

  it("refuses one sentence, or three", async () => {
    const short = { ...good, M1: `${t("fra")} has started 4 of his last 5 and is worth 13.8 fantasy points a game over the next 5.` };
    const ask = scripted(short, { M1: short.M1 });
    const result = await writeScoutReasons({ facts, model: "gemini-test", apiKey: "k", ask });
    expect(result.byMember.m1!.ok === false && result.byMember.m1!.violations.join(" ")).toContain("two sentences");
  });

  it("asks in the analyst voice whatever the league's write-ups use", async () => {
    const ask = scripted(good);
    const seen: string[] = [];
    await writeScoutReasons({
      facts,
      model: "gemini-test",
      apiKey: "k",
      ask: async (request) => {
        seen.push(request.system);
        return ask(request);
      },
    });
    expect(seen[0]).toContain("analyst");
    expect(seen[0]).not.toContain("pundit");
  });

  it("sends the sheet in tokens, with each move's key", () => {
    const prompt = reasonsPrompt(facts, facts.moves, {});
    expect(prompt).toContain("MOVE M1");
    expect(prompt).not.toContain("Francisco");
  });
});

describe("reasonsStillHold", () => {
  it("reads stored tokens through the row's own refs, so a renumbered sheet checks the right player", () => {
    const text = good.M1;
    const storedRefs = { [t("fra")]: { kind: "player" as const, id: "fra" }, [t("obst")]: { kind: "player" as const, id: "obst" } };
    // A new member's moves arrive and every player token shifts.
    const renumbered = buildScoutFacts({
      ruleset: "euroleague",
      members: [
        { memberId: "m0", moves: [move(player("aaa", "Aaa, A", 500), player("aab", "Aab, B", 1500), 1000)] },
        { memberId: "m1", moves: [move(player("obst", "Obst, Andreas", 960), player("fra", "Francisco, Sylvain", 1380), 420)] },
      ],
      privateNames: [],
    });
    expect(renumbered.tokens.get("fra")).not.toBe(t("fra"));
    expect(reasonsStillHold({ "obst|fra": text }, storedRefs, renumbered, "m1")).toBe(true);
    // Read with today's tokens instead, the same words would cite somebody else.
    expect(reasonsStillHold({ "obst|fra": text }, {}, renumbered, "m1")).toBe(false);
  });
});
