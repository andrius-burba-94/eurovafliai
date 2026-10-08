import { z } from "zod";

/**
 * What the model is told, and the shape it must answer in — slice 7.0.
 *
 * The rules are the guard's rules said in advance: a model that knows numbers
 * must be copied and tokens written exactly fails the guard far less often,
 * and every refusal costs a retry against a free quota. `PROMPT_VERSION` is
 * part of a write-up's input hash, so changing a word here regenerates.
 */

export const PROMPT_VERSION = "round-summary-1";

export const VOICES = ["analyst", "pundit"] as const;
export type Voice = (typeof VOICES)[number];

const RULES = `You write for a private fantasy league of friends who follow the EuroLeague.

Facts:
- Use only the facts you are given. Never invent a number, a player, a team, a result or a reason.
- Teams are written as tokens like @T3 and players as tokens like #P12. Write them exactly as given and never write a name instead. A possessive 's after a token is fine. Never put "a" or "an" before a token.
- Copy numbers exactly as the facts print them, as digits. Do not round them and do not work out new ones: no new sums, differences, averages or percentages.
- Say "fantasy points" or "PIR", never "points" on its own. A player's box score may say he "scored 24".
- A player who did not play is never an underperformer. Say nothing about an injury beyond what the facts state.
- Never comment on a real player's private life, looks or nationality. The fantasy teams and their managers' choices are fair game.

Form:
- Plain English and short sentences. No markdown, no lists, no emoji, no hashtags, no links.
- Answer with JSON only, in the shape you are asked for.`;

const VOICE: Readonly<Record<Voice, string>> = {
  analyst:
    "Voice: a calm, professional basketball analyst. Precise and measured; at most a dry turn of phrase.",
  pundit:
    "Voice: a witty pundit among friends. Playful banter about the fantasy teams and their managers' calls (captains, benches, deals), affectionate and never cruel, and never aimed at real players as people.",
};

export function systemRules(voice: Voice): string {
  return `${RULES}\n\n${VOICE[voice]}`;
}

const SUMMARY_TASK = `Task: write 3 to 5 lines summing up this round for the league.
- Line 1: who won the night, by how much, and the player or players who carried it.
- Then the biggest move in the table.
- Then one or two things that stood out: a surprise, a flop, a player who did not play, or a deal.
- Each line is one or two short sentences, 20 to 200 characters, with no line breaks.
Answer as JSON: {"lines": ["...", "..."]}`;

/** The task with the facts, and on a retry, what the first answer got wrong. */
export function summaryPrompt(factsText: string, refused: readonly string[] = []): string {
  const retry =
    refused.length === 0
      ? ""
      : `\n\nYour previous answer was refused for these reasons. Write it again without them:\n${refused.map((reason) => `- ${reason}`).join("\n")}`;
  return `${factsText}\n\n${SUMMARY_TASK}${retry}`;
}

/**
 * Hand-written rather than generated from the zod below: Gemini reads a
 * subset of JSON Schema with no `maxLength`, and a generated schema carries
 * keywords it would reject. Lengths are the zod's job.
 */
export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    lines: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
  },
  required: ["lines"],
  additionalProperties: false,
} as const;

export const summaryAnswer = z
  .object({
    lines: z
      .array(
        z
          .string()
          .trim()
          .min(20)
          .max(200)
          .refine((line) => !/[\r\n]/.test(line), "one line per entry"),
      )
      .min(3)
      .max(5),
  })
  .strict();

export type SummaryAnswer = z.infer<typeof summaryAnswer>;
