import { z } from "zod";

import type { BriefFacts } from "./brief-facts";
import { inputHash, numbersIn } from "./facts";
import { generateJson, GeminiNoAnswer, type GeminiAnswer, type GeminiRequest, type GeminiUsage } from "./gemini";
import { checkWriteup } from "./guard";
import type { TokenRef } from "./tokens";
import { systemRules, type Voice } from "./voice";

/**
 * Every member's brief, one call per league — slice 7.3 B.
 *
 * The prompt carries the shared table and the sections of the members asked
 * for; the answer is keyed by team token. Each member's three lines are
 * guarded against the table and that member's own section only, so a brief
 * can name the teams around it but never cite another member's deciders or
 * move worth making. One retry asks only for the members refused, with their
 * faults listed; a second refusal fails those members and keeps the rest.
 */

export const BRIEF_PROMPT_VERSION = "round-brief-2";

export const BRIEF_LINES = ["result", "standing", "next"] as const;
export type BriefLines = Readonly<Record<(typeof BRIEF_LINES)[number], string>>;

export type MemberBrief = { readonly ok: true; readonly brief: BriefLines } | { readonly ok: false; readonly violations: readonly string[] };

export type BriefsResult = {
  readonly byMember: Readonly<Record<string, MemberBrief>>;
  readonly usage: GeminiUsage;
  readonly model: string;
  readonly calls: number;
};

type Ask = (request: GeminiRequest) => Promise<GeminiAnswer>;

const TASK = `Task: write each team's brief: three lines to that team's manager about their own round, in the second person ("you", "your").
- result: whether the night was won, held or lost (the NIGHT line), and the one or two things that decided it (the DECIDER lines), with their values.
- standing: the gap to the team above and the lead over the team below (the STANDING line), then the TREND line's word (rising, falling or steady) or the HONOUR line when there is one. Never write a place in the table (1st, 2nd, 3rd…) or how many places the team moved: the page already shows both.
- next: the next round's run, the unavailable player if there is one, and the best move if there is one (the NEXT line). No captain, lineup or start/sit advice.
- Each line is exactly one sentence, 20 to 200 characters, on one line.
- Use only the table and that team's own lines. Never mention another team's night, deciders, players or moves; other teams may appear only as the table shows them.
- Say "fantasy points", "Modern points" or "PIR" as the lines do, never "points" on its own.`;

const memberToken = (facts: BriefFacts, memberId: string) =>
  Object.entries(facts.refs).find(([, ref]) => ref.kind === "member" && ref.id === memberId)?.[0] ?? null;

/** The task with the table, the sections asked for, and a retry's faults. */
function briefPrompt(facts: BriefFacts, asked: readonly { memberId: string; token: string }[], faults: readonly string[]): string {
  return [
    facts.header,
    ...asked.map((entry) => facts.sectionFor(entry.memberId)),
    TASK,
    `Answer as JSON: {${asked.map((entry) => `"${entry.token}": {"result": "...", "standing": "...", "next": "..."}`).join(", ")}}`,
    ...(faults.length === 0 ? [] : [`Your previous briefs for these teams were refused. Write them again without these faults:\n${faults.map((fault) => `- ${fault}`).join("\n")}`]),
  ].join("\n\n");
}

function schemaFor(tokens: readonly string[]) {
  const lines = {
    type: "object",
    properties: Object.fromEntries(BRIEF_LINES.map((key) => [key, { type: "string" }])),
    required: BRIEF_LINES,
    additionalProperties: false,
  };
  return { type: "object", properties: Object.fromEntries(tokens.map((token) => [token, lines])), required: tokens, additionalProperties: false };
}

const SENTENCE_END = /[.!?](?=\s|$)/g;

const line = z
  .string()
  .trim()
  .min(20)
  .max(200)
  .refine((text) => !/[\r\n]/.test(text), "one line")
  .refine((text) => (text.match(SENTENCE_END) ?? []).length === 1, "exactly one sentence");

const briefAnswer = z.object({ result: line, standing: line, next: line }).strict();

/** One member's answer: its shape, then the guard over each line with the table and that member's section. */
function faultsOf(facts: BriefFacts, memberId: string, token: string, value: unknown): string[] {
  const parsed = briefAnswer.safeParse(value);
  if (!parsed.success) {
    return parsed.error.issues.map((issue) => `${[token, ...issue.path].join(" ")}: ${value === undefined ? "missing" : issue.message}`);
  }
  return [
    ...checkWriteup(
      BRIEF_LINES.map((key) => parsed.data[key]),
      {
        allowed: new Set(numbersIn(`${facts.header}\n${facts.sectionFor(memberId)}`)),
        tokens: facts.tokensFor(memberId),
        privateNames: facts.privateNames,
      },
      BRIEF_LINES.map((key) => `${token} ${key}`),
    ).violations,
  ];
}

export async function writeBriefs({
  facts,
  memberIds = facts.memberIds,
  voice,
  model,
  apiKey,
  ask,
}: {
  facts: BriefFacts;
  /** The members due; one row each. */
  memberIds?: readonly string[];
  voice: Voice;
  model: string;
  apiKey: string;
  ask?: Ask;
}): Promise<BriefsResult> {
  const call: Ask = ask ?? ((request) => generateJson(request, { apiKey }));
  const usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
  const accepted = new Map<string, BriefLines>();
  const faults = new Map<string, string[]>();
  let pending = memberIds.flatMap((memberId) => {
    const token = memberToken(facts, memberId);
    if (!token) faults.set(memberId, ["not in this round's table"]);
    return token ? [{ memberId, token }] : [];
  });
  let answeredBy = model;
  let calls = 0;

  for (let attempt = 1; attempt <= 2 && pending.length > 0; attempt += 1) {
    calls += 1;
    let value: Record<string, unknown> = {};
    try {
      const answer = await call({
        model,
        system: systemRules(voice),
        prompt: briefPrompt(facts, pending, pending.flatMap((entry) => faults.get(entry.memberId) ?? [])),
        schema: schemaFor(pending.map((entry) => entry.token)),
      });
      usage.inputTokens += answer.usage.inputTokens;
      usage.outputTokens += answer.usage.outputTokens;
      usage.thinkingTokens += answer.usage.thinkingTokens;
      answeredBy = answer.model || model;
      if (answer.value && typeof answer.value === "object") value = answer.value as Record<string, unknown>;
    } catch (error) {
      if (!(error instanceof GeminiNoAnswer)) throw error;
      for (const entry of pending) faults.set(entry.memberId, [error.message]);
      continue;
    }
    for (const entry of pending) {
      const found = faultsOf(facts, entry.memberId, entry.token, value[entry.token]);
      if (found.length > 0) {
        faults.set(entry.memberId, found);
        continue;
      }
      faults.delete(entry.memberId);
      accepted.set(entry.memberId, briefAnswer.parse(value[entry.token]));
    }
    pending = pending.filter((entry) => !accepted.has(entry.memberId));
  }

  const byMember: Record<string, MemberBrief> = {};
  for (const memberId of memberIds) {
    const brief = accepted.get(memberId);
    byMember[memberId] = brief ? { ok: true, brief } : { ok: false, violations: faults.get(memberId) ?? ["no usable answer"] };
  }
  return { byMember, usage, model: answeredBy, calls };
}

/** What a member's row may render: the table's tokens and their own section's, nobody else's. */
export function briefRefs(facts: BriefFacts, memberId: string): Record<string, TokenRef> {
  const own = facts.tokensFor(memberId);
  return Object.fromEntries(Object.entries(facts.refs).filter(([token]) => own.has(token)));
}

/** What a member's row is claimed with: the text the brief rests on, and its hash. */
export function briefInput(facts: BriefFacts, memberId: string, { voice, model }: { voice: Voice; model: string }) {
  const text = `${facts.header}\n\n${facts.sectionFor(memberId)}`;
  return {
    text,
    inputHash: inputHash({ kind: "round_brief", text, refs: briefRefs(facts, memberId), voice, promptVersion: BRIEF_PROMPT_VERSION, model }),
  };
}

/** A stored row's three lines, or null for anything this version cannot show. */
export function storedBrief(output: unknown): BriefLines | null {
  const parsed = z.object({ result: z.string(), standing: z.string(), next: z.string() }).strict().safeParse(output);
  return parsed.success ? parsed.data : null;
}
