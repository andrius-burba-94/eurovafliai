import type PocketBase from "pocketbase";

import { parseLeagueSettings, type WriteupSettings } from "@/lib/leagues/settings";

import { inputHash } from "./facts";
import { GeminiKeyRefused, GeminiQuota, GeminiRequestRefused, GeminiUnavailable } from "./gemini";
import type { RoundFacts } from "./round-facts";
import {
  claimWriteup,
  completeWriteup,
  failWriteup,
  instant,
  markGuarded,
  readLeagueWriteups,
  readRewriteRequests,
  STALE_AFTER_MS,
  type WriteupRecord,
} from "./store";
import { guardWriteup, writeRoundSummary } from "./summary";
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
 * an outage) fails the row and ends the pass: the next one, fifteen minutes
 * on, is the retry, and asking again now would only spend the quota.
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

type League = { readonly id: string; readonly ai: WriteupSettings };

/** The kind of Gemini failure that says "not now" rather than "not this answer". */
class PassStopped extends Error {}

const stopping = (error: unknown) =>
  error instanceof GeminiQuota ||
  error instanceof GeminiKeyRefused ||
  error instanceof GeminiUnavailable ||
  error instanceof GeminiRequestRefused;

async function enabledLeagues(pb: PocketBase): Promise<League[]> {
  const rows = await pb
    .collection("leagues")
    .getFullList<{ id: string; settings?: unknown }>({ filter: `status = 'season'`, fields: "id,settings", requestKey: null });
  return rows.map((row) => ({ id: row.id, ai: parseLeagueSettings(row.settings).ai })).filter((league) => league.ai.enabled);
}

/** One round, claimed, written, stored. Returns what happened, never throws for a refusal. */
async function writeRound(
  deps: RoundPassDeps,
  league: League,
  round: number,
  force: boolean,
): Promise<"written" | "refused" | "skipped"> {
  const facts = await deps.readFacts(league.id, round);
  if (!facts) return "skipped";
  const { voice } = league.ai;
  const now = deps.now();
  const claim = await claimWriteup(
    deps.pb,
    { leagueId: league.id, season: deps.season, round, kind: KIND, memberId: "" },
    {
      inputHash: inputHash({ kind: KIND, text: facts.text, refs: facts.refs, voice, promptVersion: PROMPT_VERSION, model: deps.model }),
      voice,
      model: deps.model,
      promptVersion: PROMPT_VERSION,
      facts: { version: facts.version, round: facts.round, text: facts.text },
      now,
      force,
    },
  );
  if (claim.outcome !== "claimed") return "skipped";

  let result: Awaited<ReturnType<typeof writeRoundSummary>>;
  try {
    result = await (deps.write ?? writeRoundSummary)({ facts, voice, model: deps.model, apiKey: deps.apiKey });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await failWriteup(deps.pb, claim.id, message);
    if (stopping(error)) throw new PassStopped(message);
    throw error;
  }
  if (!result.ok || !result.writeup) {
    await failWriteup(deps.pb, claim.id, result.violations.join("; "), result.usage);
    return "refused";
  }
  await completeWriteup(deps.pb, claim.id, {
    writeup: result.writeup,
    refs: facts.refs,
    usage: result.usage,
    model: result.model,
    now: deps.now(),
  });
  return "written";
}

/** When the newest stat correction landed: an applied import that changed stored rows. */
async function latestCorrection(pb: PocketBase): Promise<number> {
  const batches = await pb
    .collection("stat_imports")
    .getFullList<{ updated_rows?: number; updated?: string }>({ filter: `applied = true`, fields: "updated_rows,updated", requestKey: null });
  return batches.reduce((latest, batch) => ((batch.updated_rows ?? 0) > 0 ? Math.max(latest, instant(batch.updated)) : latest), 0);
}

/**
 * A round is written while it holds prose a page can show, whatever its
 * status: a failed rewrite keeps the last good write-up (the store's rule),
 * and asking again on every pass would only spend the quota on it.
 */
const isShowable = (row: WriteupRecord) => storedWriteup(row.output) !== null;

/** The fifteen-minute pass: write what is missing, then re-guard what is written. */
export async function runRoundPass(deps: RoundPassDeps): Promise<PassReport> {
  const report: PassReport = { written: 0, refused: 0, guarded: 0, rewritten: 0, stopped: null };
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };
  let budget = CALLS_PER_PASS;

  const tally = (outcome: "written" | "refused" | "skipped", rewrite: boolean) => {
    if (outcome === "skipped") return;
    budget -= 1;
    if (outcome === "refused") report.refused += 1;
    else if (rewrite) report.rewritten += 1;
    else report.written += 1;
  };

  try {
    const leagues = await enabledLeagues(deps.pb);
    const rowsByLeague = new Map<string, (WriteupRecord & { readonly round: number })[]>();
    for (const league of leagues) {
      rowsByLeague.set(league.id, await readLeagueWriteups(deps.pb, league.id, deps.season, KIND));
    }

    // 1. Missing rounds, oldest first, league by league.
    for (const league of leagues) {
      const byRound = new Map(rowsByLeague.get(league.id)!.map((row) => [row.round, row]));
      for (const round of await deps.readComplete(league.id)) {
        if (budget <= 0) return report;
        const row = byRound.get(round);
        if (row && isShowable(row)) continue;
        tally(await writeRound(deps, league, round, false), false);
      }
    }

    // 2. Re-guard what is written: daily, or since the last correction.
    const corrected = await latestCorrection(deps.pb);
    const now = deps.now();
    for (const league of leagues) {
      for (const row of rowsByLeague.get(league.id)!) {
        const stored = row.status === "pending" ? null : storedWriteup(row.output);
        if (!stored) continue;
        const checked = instant(row.last_guarded_at) || instant(row.generated_at) || 0;
        if (now - checked < DAILY_MS && corrected <= checked) continue;
        const facts = await deps.readFacts(league.id, row.round);
        if (!facts) continue;
        if (guardWriteup(stored, facts).violations.length === 0) {
          await markGuarded(deps.pb, row.id, now);
          report.guarded += 1;
          continue;
        }
        if (budget <= 0) return report;
        tally(await writeRound(deps, league, row.round, true), true);
      }
    }
  } catch (error) {
    if (error instanceof PassStopped) return { ...report, stopped: error.message };
    throw error;
  }
  return report;
}

/**
 * The one-minute check for the commissioner's Rewrite. Leaves a request
 * standing when the league has write-ups off, or a fresh claim is already
 * writing the row (that claim clears it).
 */
export async function writeRequestedRounds(deps: RoundPassDeps): Promise<PassReport> {
  const report: PassReport = { written: 0, refused: 0, guarded: 0, rewritten: 0, stopped: null };
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };
  const requests = (await readRewriteRequests(deps.pb)).filter(
    (row) => row.kind === KIND && !row.member && row.season === deps.season,
  );
  if (requests.length === 0) return report;

  const leagues = new Map((await enabledLeagues(deps.pb)).map((league) => [league.id, league]));
  const now = deps.now();
  let budget = CALLS_PER_PASS;
  try {
    for (const row of requests) {
      if (budget <= 0) break;
      const league = leagues.get(row.league);
      if (!league) continue;
      if (row.status === "pending" && now - instant(row.claimed_at) < STALE_AFTER_MS) continue;
      const outcome = await writeRound(deps, league, row.round, true);
      if (outcome === "skipped") continue;
      budget -= 1;
      if (outcome === "refused") report.refused += 1;
      else report.rewritten += 1;
    }
  } catch (error) {
    if (error instanceof PassStopped) return { ...report, stopped: error.message };
    throw error;
  }
  return report;
}
