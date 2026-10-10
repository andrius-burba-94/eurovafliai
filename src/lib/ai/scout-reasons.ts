import { z } from "zod";

import { pairKey } from "@/lib/advisor/scout";

import { numbersIn } from "./facts";
import { generateJson, GeminiNoAnswer, type GeminiAnswer, type GeminiRequest, type GeminiUsage } from "./gemini";
import { checkWriteup } from "./guard";
import type { ScoutFacts, ScoutFactsMove } from "./scout-facts";
import { TOKEN_PATTERN, type TokenRef } from "./tokens";
import { systemRules } from "./voice";

/**
 * Two sentences for each move worth making — slice 7.2 G.
 *
 * One call per league for every move due, always in the analyst voice: advice
 * about a member's own roster is not a place for a joke at their expense. Each
 * reason is guarded against its own move's block only, so it can cite that
 * move's players and figures and nothing else: no other member's advice can
 * reach it. One retry, asking again only for the moves that were refused, with
 * their faults listed. A member's reasons are kept only when every one of
 * their moves passed; otherwise their row fails and the page shows the numbers.
 */

export const SCOUT_PROMPT_VERSION = "scout-moves-1";

export type Ask = (request: GeminiRequest) => Promise<GeminiAnswer>;

/** `drop|add` → the reason in tokens. */
export type ScoutReasons = Readonly<Record<string, string>>;

export type MemberReasons =
  | { readonly ok: true; readonly reasons: ScoutReasons }
  | { readonly ok: false; readonly violations: readonly string[] };

export type ScoutReasonsResult = {
  readonly byMember: Readonly<Record<string, MemberReasons>>;
  readonly usage: GeminiUsage;
  readonly model: string;
  readonly calls: number;
};


const TASK = `Task: write the reason for each move.
- Exactly two sentences per move, 60 to 300 characters in all, on one line.
- Sentence 1: why the added player, from his own lines (his figures, his minutes and role, his starts).
- Sentence 2: why now, from the calendar and the club's chance of winning, or the risk (low confidence, last season's games, the drop's form).
- Use only the lines of that move: its MOVE, ADD and DROP lines. Never mention another move, another team or a player from another move.
- Say "fantasy points", "Modern points" or "PIR" as the lines do, never "points" on its own.`;

/** The task with the sheet's header and the moves asked for, plus a retry's faults. */
export function reasonsPrompt(
  facts: ScoutFacts,
  moves: readonly ScoutFactsMove[],
  refused: Readonly<Record<string, readonly string[]>>,
): string {
  const asked = new Set(moves.map((move) => move.memberId));
  const sections = [...asked].sort().map((memberId) =>
    [facts.sectionFor(memberId).split("\n")[0], ...moves.filter((move) => move.memberId === memberId).map((move) => move.text)].join("\n"),
  );
  const retry = Object.entries(refused).filter(([, faults]) => faults.length > 0);
  return [
    facts.header,
    ...sections,
    TASK,
    `Answer as JSON: {${moves.map((move) => `"${move.id}": "..."`).join(", ")}}`,
    ...(retry.length === 0
      ? []
      : [
          `Your previous answers for these moves were refused. Write them again without these faults:\n${retry
            .flatMap(([, faults]) => faults.map((fault) => `- ${fault}`))
            .join("\n")}`,
        ]),
  ].join("\n\n");
}

function schemaFor(moves: readonly ScoutFactsMove[]) {
  return {
    type: "object",
    properties: Object.fromEntries(moves.map((move) => [move.id, { type: "string" }])),
    required: moves.map((move) => move.id),
    additionalProperties: false,
  };
}

const SENTENCE_END = /[.!?](?=\s|$)/g;

const reason = z
  .string()
  .trim()
  .min(60)
  .max(300)
  .refine((text) => !/[\r\n]/.test(text), "one line")
  .refine((text) => (text.match(SENTENCE_END) ?? []).length === 2, "exactly two sentences");

/** One move's reason against its own block: shape, then the 7.0 guard with that block's numbers and tokens. */
function faultsOf(move: ScoutFactsMove, value: unknown, facts: ScoutFacts): string[] {
  const parsed = reason.safeParse(value);
  if (!parsed.success) return parsed.error.issues.map((issue) => `${move.id}: ${issue.message === "Required" ? "missing" : issue.message}`);
  return [
    ...checkWriteup(
      [parsed.data],
      { allowed: new Set(numbersIn(move.text)), tokens: move.tokens, privateNames: facts.privateNames },
      [move.id],
    ).violations,
  ];
}

export async function writeScoutReasons({
  facts,
  moves = facts.moves,
  model,
  apiKey,
  ask,
}: {
  facts: ScoutFacts;
  /** The moves due; the members they belong to are the rows to write. */
  moves?: readonly ScoutFactsMove[];
  model: string;
  apiKey: string;
  ask?: Ask;
}): Promise<ScoutReasonsResult> {
  const call: Ask = ask ?? ((request) => generateJson(request, { apiKey }));
  const usage = { inputTokens: 0, outputTokens: 0, thinkingTokens: 0 };
  const accepted = new Map<string, string>();
  let faults: Record<string, string[]> = {};
  let pending = [...moves];
  let answeredBy = model;
  let calls = 0;

  for (let attempt = 1; attempt <= 2 && pending.length > 0; attempt += 1) {
    calls += 1;
    let value: Record<string, unknown> = {};
    try {
      const answer = await call({
        model,
        system: systemRules("analyst"),
        prompt: reasonsPrompt(facts, pending, faults),
        schema: schemaFor(pending),
      });
      usage.inputTokens += answer.usage.inputTokens;
      usage.outputTokens += answer.usage.outputTokens;
      usage.thinkingTokens += answer.usage.thinkingTokens;
      answeredBy = answer.model || model;
      if (answer.value && typeof answer.value === "object") value = answer.value as Record<string, unknown>;
    } catch (error) {
      if (!(error instanceof GeminiNoAnswer)) throw error;
      faults = Object.fromEntries(pending.map((move) => [move.id, [error.message]]));
      continue;
    }
    faults = {};
    for (const move of pending) {
      const found = faultsOf(move, value[move.id], facts);
      if (found.length === 0) accepted.set(move.id, String(value[move.id]).trim());
      else faults[move.id] = found;
    }
    pending = pending.filter((move) => !accepted.has(move.id));
  }

  const byMember: Record<string, MemberReasons> = {};
  for (const memberId of [...new Set(moves.map((move) => move.memberId))]) {
    const own = moves.filter((move) => move.memberId === memberId);
    const violations = own.flatMap((move) => faults[move.id] ?? []);
    byMember[memberId] = own.every((move) => accepted.has(move.id))
      ? { ok: true, reasons: Object.fromEntries(own.map((move) => [pairKey(move.dropId, move.addId), accepted.get(move.id)!])) }
      : { ok: false, violations: violations.length > 0 ? violations : ["no usable answer"] };
  }
  return { byMember, usage, model: answeredBy, calls };
}

/** A stored row's reasons, or null for anything this version cannot show. */
export function storedReasons(output: unknown): ScoutReasons | null {
  const parsed = z.object({ reasons: z.record(z.string(), z.string()) }).safeParse(output);
  return parsed.success ? parsed.data.reasons : null;
}

/**
 * Re-guard: do stored reasons still hold against today's blocks for the same
 * pairs? Tokens are numbered across the league, so another member's moves can
 * renumber this member's players; each stored token is read through the
 * row's own refs and rewritten as today's before the guard sees it. A token
 * the row cannot account for fails, rather than being checked as somebody else.
 */
export function reasonsStillHold(
  reasons: ScoutReasons,
  storedRefs: Readonly<Record<string, TokenRef>>,
  facts: ScoutFacts,
  memberId: string,
): boolean {
  const today = (token: string) => {
    const ref = storedRefs[token];
    return ref ? facts.tokens.get(ref.id) : undefined;
  };
  return facts.moves
    .filter((move) => move.memberId === memberId)
    .every((move) => {
      const text = reasons[pairKey(move.dropId, move.addId)];
      if (text === undefined) return true;
      let unknown = false;
      const translated = text.replace(TOKEN_PATTERN, (token) => {
        const current = today(token);
        if (!current) unknown = true;
        return current ?? token;
      });
      return !unknown && faultsOf(move, translated, facts).length === 0;
    });
}
