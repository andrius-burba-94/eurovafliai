import { z } from "zod";

/**
 * What the model is told, and the shape it must answer in — slice 7.0.
 *
 * The rules are the guard's rules said in advance: a model that knows numbers
 * must be copied and tokens written exactly fails the guard far less often,
 * and every refusal costs a retry against a free quota. `PROMPT_VERSION` is
 * part of a write-up's input hash, so changing a word here regenerates.
 */

export const PROMPT_VERSION = "round-summary-2";

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

/**
 * The analyst's sections — 7.1. Which ones a round gets is decided here, from
 * the labels the sheet carries, not by the model: a section with nothing
 * behind it is one the model would have to invent.
 */
export const SECTION_KEYS = ["stars", "over", "under", "surprises", "table", "swing"] as const;
export type SectionKey = (typeof SECTION_KEYS)[number];

const SECTION_SOURCES: Readonly<Record<SectionKey, RegExp>> = {
  stars: /^STARS\b/m,
  over: /^OVERPERFORMER\b/m,
  under: /^UNDERPERFORMER\b/m,
  surprises: /^(SURPRISE|CAPTAIN FLOP|CAPTAIN HIT|DID NOT PLAY|ROLE CHANGE)\b/m,
  table: /^(TABLE SUMMARY|MOVER)\b/m,
  swing: /^BIGGEST SWING\b|biggest swing of the round/m,
};

const SECTION_BRIEF: Readonly<Record<SectionKey, string>> = {
  stars: "stars: the STARS line, the best nights of the round",
  over: "over: the OVERPERFORMER lines",
  under: "under: the UNDERPERFORMER lines",
  surprises: "surprises: SURPRISE, CAPTAIN FLOP, CAPTAIN HIT, DID NOT PLAY and ROLE CHANGE lines",
  table: "table: TABLE SUMMARY and MOVER lines, how the season table moved",
  swing: "swing: the deal marked as the biggest swing of the round",
};

export function sectionsIn(factsText: string): SectionKey[] {
  return SECTION_KEYS.filter((key) => SECTION_SOURCES[key].test(factsText));
}

export type RoundWriteup = {
  readonly headline: string;
  readonly lines: readonly string[];
  readonly sections: Readonly<Partial<Record<SectionKey, string>>>;
};

export type WriteupEntry = { readonly label: string; readonly text: string };

/** Every piece of prose, labelled as the guard reports it and in reading order. */
export function writeupEntries(writeup: RoundWriteup): WriteupEntry[] {
  return [
    { label: "headline", text: writeup.headline },
    ...writeup.lines.map((text, index) => ({ label: `line ${index + 1}`, text })),
    ...SECTION_KEYS.flatMap((key) => {
      const text = writeup.sections[key];
      return text === undefined ? [] : [{ label: key, text }];
    }),
  ];
}

function summaryTask(sections: readonly SectionKey[]): string {
  const asked =
    sections.length === 0
      ? `- Leave "sections" empty: {}.`
      : `- Then write exactly these sections: ${sections.join(", ")}. Each is one or two short sentences, 20 to 300 characters, about what its lines say:\n${sections.map((key) => `  - ${SECTION_BRIEF[key]}`).join("\n")}`;
  return `Task: write up this round for the league.
- A headline of 20 to 90 characters: who won the night, or the round's story.
- Then 3 to 5 lines summing up the round:
  - Line 1: who won the night, by how much, and the player or players who carried it.
  - Then the biggest move in the table.
  - Then one or two things that stood out: a surprise, a flop, a player who did not play, or a deal.
  - Each line is one or two short sentences, 20 to 200 characters, with no line breaks.
${asked}
Answer as JSON: {"headline": "...", "lines": ["...", "..."], "sections": {"stars": "...", ...}}`;
}

/** The task with the facts, and on a retry, what the first answer got wrong. */
export function summaryPrompt(factsText: string, sections: readonly SectionKey[], refused: readonly string[] = []): string {
  const retry =
    refused.length === 0
      ? ""
      : `\n\nYour previous answer was refused for these reasons. Write it again without them:\n${refused.map((reason) => `- ${reason}`).join("\n")}`;
  return `${factsText}\n\n${summaryTask(sections)}${retry}`;
}

/**
 * Hand-written rather than generated from the zod below: Gemini reads a
 * subset of JSON Schema with no `maxLength`, and a generated schema carries
 * keywords it would reject. Lengths are the zod's job.
 */
export const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    headline: { type: "string" },
    lines: { type: "array", items: { type: "string" }, minItems: 3, maxItems: 5 },
    sections: {
      type: "object",
      properties: Object.fromEntries(SECTION_KEYS.map((key) => [key, { type: "string" }])) as Record<SectionKey, { type: "string" }>,
      additionalProperties: false,
    },
  },
  required: ["headline", "lines", "sections"],
  additionalProperties: false,
} as const;

const prose = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((text) => !/[\r\n]/.test(text), "one line per entry");

export const summaryAnswer = z
  .object({
    headline: prose(20, 90),
    lines: z.array(prose(20, 200)).min(3).max(5),
    sections: z.object(Object.fromEntries(SECTION_KEYS.map((key) => [key, prose(20, 300).optional()])) as Record<SectionKey, z.ZodOptional<ReturnType<typeof prose>>>).strict(),
  })
  .strict();
