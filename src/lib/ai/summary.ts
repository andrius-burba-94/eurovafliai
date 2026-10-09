import { numbersIn } from "./facts";
import { generateJson, GeminiNoAnswer, type GeminiUsage } from "./gemini";
import { checkWriteup } from "./guard";
import type { RoundFacts } from "./round-facts";
import { summaryAnswer, SUMMARY_SCHEMA, summaryPrompt, systemRules, type Voice } from "./voice";

/**
 * Facts in, guarded lines out — slice 7.0.
 *
 * One attempt, and at most one more with the first answer's faults spelled
 * out. A second refusal is the answer: no write-up beats a wrong one, and the
 * page that would have shown it renders exactly as it did before. Any Gemini
 * error other than an unusable answer (a refused key, a quota, an outage)
 * propagates, because those are for a person or a later pass to deal with,
 * not for a retry.
 */

export type SummaryResult = {
  readonly ok: boolean;
  /** The guarded lines, in tokens; empty when refused. */
  readonly lines: readonly string[];
  /** Why the last attempt was refused; empty on success. */
  readonly violations: readonly string[];
  readonly warnings: readonly string[];
  readonly attempts: number;
  readonly usage: GeminiUsage;
  readonly model: string;
  readonly latencyMs: number;
};

export async function writeRoundSummary({
  facts,
  voice,
  model,
  apiKey,
  doFetch,
  wait,
}: {
  facts: RoundFacts;
  voice: Voice;
  model: string;
  apiKey: string;
  doFetch?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}): Promise<SummaryResult> {
  const context = {
    allowed: new Set(numbersIn(facts.text)),
    tokens: new Set(Object.keys(facts.refs)),
    privateNames: facts.privateNames,
    numbersByToken: facts.numbersByToken,
    sharedNumbers: facts.sharedNumbers,
  };
  const usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
  let refused: readonly string[] = [];
  let latencyMs = 0;
  let answeredBy = model;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    let lines: string[];
    try {
      const answer = await generateJson(
        { model, system: systemRules(voice), prompt: summaryPrompt(facts.text, refused), schema: SUMMARY_SCHEMA },
        { apiKey, ...(doFetch ? { doFetch } : {}), ...(wait ? { wait } : {}) },
      );
      usage.inputTokens += answer.usage.inputTokens;
      usage.outputTokens += answer.usage.outputTokens;
      usage.thinkingTokens += answer.usage.thinkingTokens;
      latencyMs += answer.latencyMs;
      answeredBy = answer.model || model;
      const parsed = summaryAnswer.safeParse(answer.value);
      if (!parsed.success) {
        refused = parsed.error.issues.map((issue) => `the answer's shape: ${issue.path.join(".") || "answer"} ${issue.message}`);
        continue;
      }
      lines = parsed.data.lines;
    } catch (error) {
      if (!(error instanceof GeminiNoAnswer)) throw error;
      refused = [error.message];
      continue;
    }

    const verdict = checkWriteup(lines, context);
    if (verdict.violations.length === 0) {
      return { ok: true, lines, violations: [], warnings: verdict.warnings, attempts: attempt, usage, model: answeredBy, latencyMs };
    }
    refused = verdict.violations;
  }

  return { ok: false, lines: [], violations: refused, warnings: [], attempts: 2, usage, model: answeredBy, latencyMs };
}
