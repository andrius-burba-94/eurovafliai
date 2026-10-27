import type PocketBase from "pocketbase";

import { parseLeagueSettings, type WriteupSettings } from "@/lib/leagues/settings";

import { inputHash } from "./facts";
import { GeminiKeyRefused, GeminiQuota, GeminiRequestRefused, GeminiUnavailable, type GeminiUsage } from "./gemini";
import type { RoundFacts } from "./round-facts";
import {
  abandonClaim,
  claimWriteup,
  completeWriteup,
  failWriteup,
  instant,
  isFreshClaim,
  markGuarded,
  notDue,
  readLeagueWriteups,
  readRewriteRequests,
  type Claim,
  type WriteupKey,
  type WriteupRecord,
} from "./store";
import { guardWriteup, writeRoundSummary } from "./summary";
import type { TokenRef } from "./tokens";
import { PROMPT_VERSION, storedWriteup } from "./voice";

/**
 * The worker's write-up pass — slice 7.1, rewrite policy ADR-0013.
 *
 * Three jobs, one budget of model calls:
 *
 * 1. **Write** every finished round that has no write-up yet, oldest first.
 *    On first deploy this is the backfill; after that it is one round a week.
 * 2. **Re-guard** written rounds once a day, and after a stat correction:
 *    rebuild the sheet and run the guard on the *stored* prose. Prose that
 *    still passes stands even though its hash moved (the latest round's sheet
 *    carries today's injury flags, and the model and prompt are in the hash
 *    too). Prose that no longer passes is rewritten in the league's voice now.
 * 3. **Rewrite on request** — the commissioner's button — on its own
 *    one-minute check, `writeRequestedRounds`.
 *
 * A Gemini error that is not about this one answer (a refused key, the quota,
 * an outage) puts the row back and ends the pass: the next one, fifteen
 * minutes on, is the retry, and asking again now would only spend the quota.
 *
 * Framework-free: the worker runs it. The fact reader and the model call come
 * in as functions, so the tests can drive every branch without a league.
 */

export const DAILY_MS = 24 * 60 * 60_000;
/** Model calls per pass, across every league: a free quota is spread, not spent. */
export const CALLS_PER_PASS = 2;

const KIND = "round_summary" as const;

export type RoundPassDeps = {
  readonly pb: PocketBase;
  /** `E2026`, as `ai_writeups.season` stores it. */
  readonly season: string;
  readonly apiKey: string;
  readonly model: string;
  readonly now: () => number;
  /** Finished rounds, ascending. */
  readonly readComplete: (leagueId: string) => Promise<readonly number[]>;
  /** The round's sheet, or null when the reader refuses it (not final, not in season). */
  readonly readFacts: (leagueId: string, round: number) => Promise<RoundFacts | null>;
  readonly write?: typeof writeRoundSummary;
};

export type PassReport = {
  written: number;
  refused: number;
  guarded: number;
  rewritten: number;
  /** Why the pass ended early, when it did. */
  stopped: string | null;
};

export type League = { readonly id: string; readonly ai: WriteupSettings };

/** The one-minute check's reads, made once for the round write-ups and the briefs alike. */
export type RewriteReads = {
  readonly requests: Awaited<ReturnType<typeof readRewriteRequests>>;
  readonly leagues: readonly League[];
};

/** Google said "not now": the pass ends, and the next one is the retry. */
export class PassStopped extends Error {}

export const stopping = (error: unknown) =>
  error instanceof GeminiQuota ||
  error instanceof GeminiKeyRefused ||
  error instanceof GeminiUnavailable ||
  error instanceof GeminiRequestRefused;

/** Runs a pass's body and reports a `PassStopped` on it rather than throwing. */
export async function untilStopped<R extends { stopped: string | null }>(report: R, run: () => Promise<unknown>): Promise<R> {
  try {
    await run();
  } catch (error) {
    if (!(error instanceof PassStopped)) throw error;
    report.stopped = error.message;
  }
  return report;
}

export async function enabledLeagues(pb: PocketBase): Promise<League[]> {
  const rows = await pb
    .collection("leagues")
    .getFullList<{ id: string; settings?: unknown }>({ filter: `status = 'season'`, fields: "id,settings", requestKey: null });
  return rows.map((row) => ({ id: row.id, ai: parseLeagueSettings(row.settings).ai })).filter((league) => league.ai.enabled);
}

/** One row a pass wants written: its key, and what its claim records. */
type WriteRequest = { readonly key: WriteupKey } & Omit<Parameters<typeof claimWriteup>[2], "model" | "now" | "force">;

type Verdict =
  | { readonly ok: true; readonly writeup: Parameters<typeof completeWriteup>[2]["writeup"]; readonly refs: Readonly<Record<string, TokenRef>> }
  | { readonly ok: false; readonly violations: readonly string[] };

/**
 * How every pass writes: claim each row, ask the model once for the rows
 * claimed, then finish each row on its own — written, refused, or put back
 * when the call threw (store.ts has the rules). One helper, so the round,
 * brief and scout passes cannot drift apart again. `verdict` answers by
 * member id, "" for a league-wide row. Returns the member ids written and
 * refused; null when nothing could be claimed, so no call was made.
 */
export async function claimAndWrite(
  pb: PocketBase,
  rows: readonly WriteRequest[],
  { model, now, force }: { readonly model: string; readonly now: () => number; readonly force: boolean },
  ask: (memberIds: readonly string[]) => Promise<{ usage: GeminiUsage; model: string; verdict: (memberId: string) => Verdict | undefined }>,
): Promise<{ written: string[]; refused: string[] } | null> {
  const at = now();
  const claimed: (Extract<Claim, { outcome: "claimed" }> & { memberId: string })[] = [];
  for (const row of rows) {
    const claim = await claimWriteup(pb, row.key, { ...row, model, now: at, force });
    if (claim.outcome === "claimed") claimed.push({ ...claim, memberId: row.key.memberId });
  }
  if (claimed.length === 0) return null;

  let answer: Awaited<ReturnType<typeof ask>>;
  try {
    answer = await ask(claimed.map((entry) => entry.memberId));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const entry of claimed) await abandonClaim(pb, entry, message, stopping(error));
    if (stopping(error)) throw new PassStopped(message);
    throw error;
  }

  const outcome = { written: [] as string[], refused: [] as string[] };
  for (const entry of claimed) {
    const verdict = answer.verdict(entry.memberId);
    if (verdict?.ok) {
      await completeWriteup(pb, entry.id, { ...verdict, usage: answer.usage, model: answer.model, now: now() });
      outcome.written.push(entry.memberId);
    } else {
      await failWriteup(pb, entry.id, verdict ? verdict.violations.join("; ") : "no answer for this member", answer.usage);
      outcome.refused.push(entry.memberId);
    }
  }
  return outcome;
}

/**
 * One round, claimed, written, stored, and counted: a forced write is a
 * rewrite. True when it spent a call; never throws for a refusal.
 */
async function writeRound(deps: RoundPassDeps, report: PassReport, league: League, round: number, force: boolean): Promise<boolean> {
  const facts = await deps.readFacts(league.id, round);
  if (!facts) return false;
  const { voice } = league.ai;
  const request: WriteRequest = {
    key: { leagueId: league.id, season: deps.season, round, kind: KIND, memberId: "" },
    inputHash: inputHash({ kind: KIND, text: facts.text, refs: facts.refs, voice, promptVersion: PROMPT_VERSION, model: deps.model }),
    voice,
    promptVersion: PROMPT_VERSION,
    facts: { version: facts.version, round: facts.round, text: facts.text },
  };
  const outcome = await claimAndWrite(deps.pb, [request], { model: deps.model, now: deps.now, force }, async () => {
    const result = await (deps.write ?? writeRoundSummary)({ facts, voice, model: deps.model, apiKey: deps.apiKey });
    return {
      usage: result.usage,
      model: result.model,
      verdict: () => (result.ok && result.writeup ? { ok: true, writeup: result.writeup, refs: facts.refs } : { ok: false, violations: result.violations }),
    };
  });
  if (!outcome) return false;
  if (outcome.refused.length > 0) report.refused += 1;
  else if (force) report.rewritten += 1;
  else report.written += 1;
  return true;
}

/** When the newest stat correction landed: an applied import that changed stored rows. */
export async function latestCorrection(pb: PocketBase): Promise<number> {
  const batches = await pb
    .collection("stat_imports")
    .getFullList<{ updated_rows?: number; updated?: string }>({ filter: `applied = true`, fields: "updated_rows,updated", requestKey: null });
  return batches.reduce((latest, batch) => ((batch.updated_rows ?? 0) > 0 ? Math.max(latest, instant(batch.updated)) : latest), 0);
}

/** A written row is checked once a day, and again once a correction lands after its last check. */
export function reguardDue(row: WriteupRecord, now: number, corrected: number): boolean {
  const checked = instant(row.last_guarded_at) || instant(row.generated_at) || 0;
  return now - checked >= DAILY_MS || corrected > checked;
}

/** The prose a written round shows, or null when it has none this version can show. */
const written = (row: WriteupRecord) => (row.status === "ready" ? storedWriteup(row.output) : null);

/** The fifteen-minute pass: write what is missing, then re-guard what is written. */
export async function runRoundPass(
  deps: RoundPassDeps,
  {
    budget: allowed = CALLS_PER_PASS,
    leagues: given,
  }: {
    /** What is left of the pass's calls once the scout's reasons (7.2 G) have gone first. */
    budget?: number;
    /** Read once for the whole fifteen-minute pass by `runWriteupPass`. */
    leagues?: readonly League[];
  } = {},
): Promise<PassReport> {
  const report: PassReport = { written: 0, refused: 0, guarded: 0, rewritten: 0, stopped: null };
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };
  let budget = allowed;

  return untilStopped(report, async () => {
    const leagues = given ?? (await enabledLeagues(deps.pb));
    const rowsByLeague = new Map<string, (WriteupRecord & { readonly round: number })[]>();
    for (const league of leagues) {
      rowsByLeague.set(league.id, await readLeagueWriteups(deps.pb, league.id, deps.season, KIND));
    }
    const now = deps.now();

    // 1. Missing rounds, oldest first, league by league. A failed rewrite is
    //    retried here until the claim's attempts run out; its last good prose
    //    shows meanwhile.
    for (const league of leagues) {
      const byRound = new Map(rowsByLeague.get(league.id)!.map((row) => [row.round, row]));
      for (const round of await deps.readComplete(league.id)) {
        if (budget <= 0) return;
        const row = byRound.get(round);
        if (row && (written(row) || notDue(row, now))) continue;
        if (await writeRound(deps, report, league, round, false)) budget -= 1;
      }
    }

    // 2. Re-guard what is written: daily, or since the last correction. Only
    //    a ready row: re-guarding a refused rewrite would force a billed
    //    rewrite every pass, forever, since a refusal moves no timestamp.
    const corrected = await latestCorrection(deps.pb);
    for (const league of leagues) {
      for (const row of rowsByLeague.get(league.id)!) {
        const stored = written(row);
        if (!stored || !reguardDue(row, now, corrected)) continue;
        const facts = await deps.readFacts(league.id, row.round);
        if (!facts) continue;
        if (guardWriteup(stored, facts).violations.length === 0) {
          await markGuarded(deps.pb, row.id, now);
          report.guarded += 1;
          continue;
        }
        if (budget <= 0) return;
        if (await writeRound(deps, report, league, row.round, true)) budget -= 1;
      }
    }
  });
}

/**
 * The one-minute check for the commissioner's Rewrite. Leaves a request
 * standing when the league has write-ups off, or a fresh claim is already
 * writing the row (that claim clears it). Forced: no attempt cap.
 */
export async function writeRequestedRounds(deps: RoundPassDeps, reads: Partial<RewriteReads> = {}): Promise<PassReport> {
  const report: PassReport = { written: 0, refused: 0, guarded: 0, rewritten: 0, stopped: null };
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };
  const now = deps.now();
  const requests = (reads.requests ?? (await readRewriteRequests(deps.pb))).filter(
    (row) => row.kind === KIND && !row.member && row.season === deps.season && !isFreshClaim(row, now),
  );
  if (requests.length === 0) return report;

  const leagues = new Map((reads.leagues ?? (await enabledLeagues(deps.pb))).map((league) => [league.id, league]));
  let budget = CALLS_PER_PASS;
  return untilStopped(report, async () => {
    for (const row of requests) {
      if (budget <= 0) return;
      const league = leagues.get(row.league);
      if (!league) continue;
      if (await writeRound(deps, report, league, row.round, true)) budget -= 1;
    }
  });
}
