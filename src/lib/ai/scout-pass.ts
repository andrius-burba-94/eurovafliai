import type PocketBase from "pocketbase";

import { inputHash } from "./facts";
import { GeminiKeyRefused, GeminiQuota, GeminiRequestRefused, GeminiUnavailable } from "./gemini";
import { DAILY_MS, enabledLeagues } from "./round-pass";
import { buildScoutFacts, type ScoutFacts } from "./scout-facts";
import type { ScoutFactsInput } from "./scout-facts-store";
import { reasonsStillHold, SCOUT_PROMPT_VERSION, storedReasons, writeScoutReasons } from "./scout-reasons";
import { claimWriteup, completeWriteup, failWriteup, instant, markGuarded, readMemberWriteups } from "./store";
import type { TokenRef } from "./tokens";

/**
 * The worker's scout pass — slice 7.2 G.
 *
 * For each league in season with write-ups on, once a round is finished: one
 * model call for every member whose reasons are due, split into one private
 * `scout_moves` row per member. It runs before the round write-up in the same
 * lock and spends from the same two-calls-a-pass budget (the worker passes
 * what it may spend), because advice is worth most at the start of a short
 * window between rounds.
 *
 * A row is due when the round has none for that member. A written row whose
 * sheet has moved is re-guarded once a day (ADR-0013): reasons the fresh sheet
 * still supports stand, and prose that no longer holds is rewritten. A pair
 * that appeared mid-round has no reason until the next round; its numbers are
 * on the page regardless.
 */

const KIND = "scout_moves" as const;
const VOICE = "analyst" as const;

export type ScoutPassDeps = {
  readonly pb: PocketBase;
  readonly season: string;
  readonly apiKey: string;
  readonly model: string;
  readonly now: () => number;
  /** Model calls this pass may make. */
  readonly budget: number;
  readonly readComplete: (leagueId: string) => Promise<readonly number[]>;
  readonly readInput: (leagueId: string) => Promise<ScoutFactsInput | null>;
  readonly write?: typeof writeScoutReasons;
};

export type ScoutPassReport = {
  /** Member rows written for the first time this round. */
  written: number;
  rewritten: number;
  refused: number;
  guarded: number;
  /** Leagues asked: what the pass spent of the shared budget. */
  calls: number;
  stopped: string | null;
};

const stopping = (error: unknown) =>
  error instanceof GeminiQuota ||
  error instanceof GeminiKeyRefused ||
  error instanceof GeminiUnavailable ||
  error instanceof GeminiRequestRefused;

/** Only the tokens in one member's section: their team and the players of their own moves. */
function refsFor(facts: ScoutFacts, memberId: string): Record<string, TokenRef> {
  const section = facts.sectionFor(memberId);
  return Object.fromEntries(Object.entries(facts.refs).filter(([token]) => new RegExp(`${token}(?!\\d)`).test(section)));
}

function hashFor(facts: ScoutFacts, memberId: string, model: string): string {
  return inputHash({
    kind: KIND,
    text: `${facts.header}\n\n${facts.sectionFor(memberId)}`,
    refs: refsFor(facts, memberId),
    voice: VOICE,
    promptVersion: SCOUT_PROMPT_VERSION,
    model,
  });
}

export async function runScoutPass(deps: ScoutPassDeps): Promise<ScoutPassReport> {
  const report: ScoutPassReport = { written: 0, rewritten: 0, refused: 0, guarded: 0, calls: 0, stopped: null };
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };

  for (const league of await enabledLeagues(deps.pb)) {
    if (report.calls >= deps.budget) break;
    const round = (await deps.readComplete(league.id)).at(-1);
    if (round === undefined) continue;
    const input = await deps.readInput(league.id);
    if (!input || input.members.length === 0) continue;
    const facts = buildScoutFacts(input);
    const now = deps.now();
    const stored = new Map(
      (await readMemberWriteups(deps.pb, { leagueId: league.id, season: deps.season, round, kind: KIND })).map((row) => [row.member, row]),
    );

    const due: { memberId: string; hash: string; rewrite: boolean }[] = [];
    for (const { memberId } of input.members) {
      const hash = hashFor(facts, memberId, deps.model);
      const row = stored.get(memberId);
      if (!row) {
        due.push({ memberId, hash, rewrite: false });
        continue;
      }
      if (row.status === "pending") continue;
      // A failure is retried pass by pass; the claim stops at MAX_ATTEMPTS on one input.
      if (row.status === "failed") {
        due.push({ memberId, hash, rewrite: false });
        continue;
      }
      if (row.input_hash === hash) continue;
      const checked = instant(row.last_guarded_at) || instant(row.generated_at) || 0;
      if (now - checked < DAILY_MS) continue;
      const reasons = storedReasons(row.output);
      if (reasons && reasonsStillHold(reasons, (row.refs ?? {}) as Record<string, TokenRef>, facts, memberId)) {
        await markGuarded(deps.pb, row.id, now);
        report.guarded += 1;
        continue;
      }
      due.push({ memberId, hash, rewrite: true });
    }
    if (due.length === 0) continue;

    const claimed: { memberId: string; id: string; rewrite: boolean }[] = [];
    for (const entry of due) {
      const claim = await claimWriteup(
        deps.pb,
        { leagueId: league.id, season: deps.season, round, kind: KIND, memberId: entry.memberId },
        {
          inputHash: entry.hash,
          voice: VOICE,
          model: deps.model,
          promptVersion: SCOUT_PROMPT_VERSION,
          facts: { version: facts.version, round, text: facts.sectionFor(entry.memberId) },
          now,
        },
      );
      if (claim.outcome === "claimed") claimed.push({ memberId: entry.memberId, id: claim.id, rewrite: entry.rewrite });
    }
    if (claimed.length === 0) continue;

    report.calls += 1;
    const members = new Set(claimed.map((entry) => entry.memberId));
    let result: Awaited<ReturnType<typeof writeScoutReasons>>;
    try {
      result = await (deps.write ?? writeScoutReasons)({
        facts,
        moves: facts.moves.filter((move) => members.has(move.memberId)),
        model: deps.model,
        apiKey: deps.apiKey,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      for (const entry of claimed) await failWriteup(deps.pb, entry.id, message);
      if (stopping(error)) return { ...report, stopped: message };
      throw error;
    }

    for (const entry of claimed) {
      const outcome = result.byMember[entry.memberId];
      if (!outcome || !outcome.ok) {
        await failWriteup(deps.pb, entry.id, outcome ? outcome.violations.join("; ") : "no answer for this member", result.usage);
        report.refused += 1;
        continue;
      }
      await completeWriteup(deps.pb, entry.id, {
        writeup: { reasons: outcome.reasons },
        refs: refsFor(facts, entry.memberId),
        usage: result.usage,
        model: result.model,
        now: deps.now(),
      });
      if (entry.rewrite) report.rewritten += 1;
      else report.written += 1;
    }
  }
  return report;
}
