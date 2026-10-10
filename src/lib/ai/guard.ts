import { numbersIn } from "./facts";

/**
 * What a write-up must pass before anybody reads it — 7.0.
 *
 * The guard checks citations, not judgement: every entity must be a token the
 * facts issued, every number must appear in the facts, and the prose must be
 * plain text. It cannot tell whether "doubled" or "carried" is fair; the fact
 * sheet's labels are what keep those honest. A violation sends the model one
 * retry with the list; a second failure means nothing is shown.
 */

export type GuardContext = {
  /** Integer hundredths read from the exact text the model was sent. */
  readonly allowed: ReadonlySet<number>;
  /** Every token the fact sheet issued. */
  readonly tokens: ReadonlySet<string>;
  /** Names the prose must not spell out: teams, users, the league, players. */
  readonly privateNames: readonly string[];
  /**
   * Numbers on each token's own lines of the sheet, plus the ones every
   * sentence may use. When present, a number in a sentence that names a
   * token should belong to that token — a warning only, until preview runs
   * show how often a fair sentence trips it.
   */
  readonly numbersByToken?: ReadonlyMap<string, ReadonlySet<number>>;
  readonly sharedNumbers?: ReadonlySet<number>;
};

export type GuardResult = {
  readonly violations: readonly string[];
  readonly warnings: readonly string[];
};

/** Counting words read the same as digits; anything bigger must be digits. */
const ALWAYS_ALLOWED = new Set([0, 100, 200, 300]);
const SPELLED_TOO_BIG =
  /\b(eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|dozen|eleventh|twelfth|thirteenth|fourteenth|fifteenth|sixteenth|seventeenth|eighteenth|nineteenth|twentieth)\b/i;
/** Anything shaped like a token, so a malformed one is caught rather than skipped. */
const TOKENISH = /[@#][\p{L}]+\d+[\p{L}\p{N}_]*/gu;
const WELL_FORMED = /^(@T|#P)\d+$/;
const BARE_TOKEN = /(?<![@#\p{L}\p{N}_])[TP]\d+(?![\p{L}\p{N}_])/u;
const ARTICLE_BEFORE_TOKEN = /\b(a|an)\s+[@#][TP]\d+/i;
const MARKDOWN = /\*\*|__|`|\[[^\]]*\]\(|^\s*([-*•]|#{1,6})\s/;
const LINK = /https?:\/\/|www\./i;
/** The voice rule the prompt states, checked: a bare "points" is ambiguous with PIR. BasketNews's are Modern points. */
const BARE_POINTS = /(?<!(?:fantasy|Modern)\s)\bpoints?\b/i;
const EMAIL = /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/u;

/** `labels` name each entry in a violation ("headline", "stars"); "line N" by default. */
export function checkWriteup(lines: readonly string[], context: GuardContext, labels?: readonly string[]): GuardResult {
  const violations: string[] = [];
  const warnings: string[] = [];

  lines.forEach((line, index) => {
    const at = labels?.[index] ?? `line ${index + 1}`;
    if (/[\r\n]/.test(line)) violations.push(`${at}: one line per entry, no line breaks`);

    for (const match of line.matchAll(TOKENISH)) {
      const token = match[0];
      if (!WELL_FORMED.test(token)) violations.push(`${at}: "${token}" is not a token; write tokens exactly, like @T1 or #P1`);
      else if (!context.tokens.has(token)) violations.push(`${at}: ${token} is not in the facts`);
    }
    if (BARE_TOKEN.test(line)) violations.push(`${at}: a token is missing its @ or #`);
    if (ARTICLE_BEFORE_TOKEN.test(line)) violations.push(`${at}: no "a" or "an" before a token`);
    if (MARKDOWN.test(line)) violations.push(`${at}: plain text only, no markdown`);
    if (LINK.test(line) || EMAIL.test(line)) violations.push(`${at}: no links or addresses`);
    if (SPELLED_TOO_BIG.test(line)) violations.push(`${at}: write numbers as digits`);
    if (BARE_POINTS.test(line)) violations.push(`${at}: say "fantasy points" or "PIR", never "points" on its own`);

    for (const value of numbersIn(line)) {
      if (!context.allowed.has(value) && !ALWAYS_ALLOWED.has(value)) {
        violations.push(`${at}: ${formatValue(value)} is not in the facts`);
      }
    }

    for (const name of context.privateNames) {
      if (containsName(line, name)) violations.push(`${at}: wrote a name instead of its token`);
    }

    if (context.numbersByToken) warnings.push(...misattributed(line, at, context));
  });

  return { violations: [...new Set(violations)], warnings };
}

/** Exact, case-sensitive, whole-word; short names are skipped as too likely to be ordinary words. */
function containsName(line: string, name: string): boolean {
  const trimmed = name.trim();
  if ([...trimmed].filter((char) => /\p{L}/u.test(char)).length < 4) return false;
  let from = line.indexOf(trimmed);
  while (from !== -1) {
    const before = line[from - 1] ?? "";
    const after = line[from + trimmed.length] ?? "";
    if (!/[\p{L}\p{N}]/u.test(before) && !/[\p{L}\p{N}]/u.test(after)) return true;
    from = line.indexOf(trimmed, from + 1);
  }
  return false;
}

function misattributed(line: string, at: string, context: GuardContext): string[] {
  const out: string[] = [];
  for (const sentence of line.split(/(?<=[.!?;])\s+/)) {
    const tokens = [...sentence.matchAll(/(@T|#P)\d+/g)].map((match) => match[0]);
    if (tokens.length === 0) continue;
    const owned = new Set<number>([...ALWAYS_ALLOWED, ...(context.sharedNumbers ?? [])]);
    for (const token of tokens) for (const value of context.numbersByToken?.get(token) ?? []) owned.add(value);
    for (const value of numbersIn(sentence)) {
      if (context.allowed.has(value) && !owned.has(value)) {
        out.push(`${at}: ${formatValue(value)} is in the facts but not on ${tokens.join(" or ")}'s lines`);
      }
    }
  }
  return out;
}

function formatValue(hundredths: number): string {
  return hundredths % 100 === 0 ? String(hundredths / 100) : (hundredths / 100).toFixed(2).replace(/0$/, "");
}
