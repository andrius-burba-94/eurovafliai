import { createHash } from "node:crypto";

/**
 * Hashing and number reading shared by the fact sheets and the guard — 7.0.
 *
 * A write-up is regenerated only when what the model would be told changes,
 * so the hash covers the exact text sent plus everything else that shapes the
 * answer. And the guard's allowed numbers are read out of that same text with
 * the same reader, so the two can never disagree about what "in the facts"
 * means.
 */

/** JSON with object keys sorted at every depth: equal values, equal strings. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value));
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(record)
        .sort()
        .map((key) => [key, sortKeys(record[key])]),
    );
  }
  return value;
}

export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

export type InputParts = {
  readonly kind: string;
  readonly text: string;
  readonly refs: Readonly<Record<string, unknown>>;
  readonly voice: string;
  readonly promptVersion: string;
  readonly model: string;
};

/** What decides whether a stored write-up is still the answer to today's facts. */
export function inputHash(parts: InputParts): string {
  return sha256Hex(canonicalJson(parts));
}

const TOKEN = /[@#][TP]\d+/g;
/**
 * A number as a reader sees it: optional thousands commas, optional decimals,
 * optionally an ordinal or a percent. Not part of a word (`E2026`, `5G`) and
 * not the tail of another number.
 */
const NUMBER = /(?<![\p{L}\p{N}_.,])(\d{1,3}(?:,\d{3})+|\d+)(\.\d+)?(?:st|nd|rd|th|%)?(?![\p{L}\p{N}_])/gu;

/**
 * Every number in a text, as integer hundredths with the sign dropped:
 * `143.0` and `143` are one number, and so are `+17.7`, `17.7` and `−17.7` —
 * a sign is the prose's choice of framing, the size is the fact.
 */
export function numbersIn(text: string): number[] {
  const values: number[] = [];
  for (const match of text.replace(TOKEN, " ").matchAll(NUMBER)) {
    const whole = match[1]!.replace(/,/g, "");
    values.push(Math.round(Number(`${whole}${match[2] ?? ""}`) * 100));
  }
  return values;
}
