import type PocketBase from "pocketbase";

import type { BriefPassReport } from "./brief-pass";
import { inputHash } from "./facts";
import { claimAndWrite, enabledLeagues, reguardDue, untilStopped, type League } from "./round-pass";
import { buildScoutFacts, type ScoutFacts } from "./scout-facts";
import type { ScoutFactsInput } from "./scout-facts-store";
import { reasonsStillHold, SCOUT_PROMPT_VERSION, storedReasons, writeScoutReasons } from "./scout-reasons";
import { markGuarded, notDue, readMemberWriteups } from "./store";
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
  /** Read once for the whole fifteen-minute pass by `runWriteupPass`. */
  readonly leagues?: readonly League[];
};

/** Shaped as the briefs' report; `written` counts member rows written for the first time this round. */
export type ScoutPassReport = BriefPassReport;

/** Only the tokens in one member's section: their team and the players of their own moves. */
function refsFor(facts: ScoutFacts, memberId: string): Record<string, TokenRef> {
  const own = new Set(facts.moves.filter((move) => move.memberId === memberId).flatMap((move) => [...move.tokens]));
  return Object.fromEntries(Object.entries(facts.refs).filter(([token]) => own.has(token)));
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

  return untilStopped(report, async () => {
    for (const league of deps.leagues ?? (await enabledLeagues(deps.pb))) {
      if (report.calls >= deps.budget) return;
      const round = (await deps.readComplete(league.id)).at(-1);
      if (round === undefined) continue;
      const input = await deps.readInput(league.id);
      if (!input || input.members.length === 0) continue;
      const facts = buildScoutFacts(input);
      const now = deps.now();
      const stored = new Map(
        (await readMemberWriteups(deps.pb, { leagueId: league.id, season: deps.season, round, kind: KIND })).map((row) => [row.member, row]),
      );

      const due: { memberId: string; hash: string }[] = [];
      const rewrites = new Set<string>();
      for (const { memberId } of input.members) {
        const hash = hashFor(facts, memberId, deps.model);
        const row = stored.get(memberId);
        // A failure is retried pass by pass; the claim stops at MAX_ATTEMPTS on one input.
        if (row?.status !== "ready") {
          if (!row || !notDue(row, now)) due.push({ memberId, hash });
          continue;
        }
        if (row.input_hash === hash || !reguardDue(row, now, 0)) continue;
        const reasons = storedReasons(row.output);
        if (reasons && reasonsStillHold(reasons, (row.refs ?? {}) as Record<string, TokenRef>, facts, memberId)) {
          await markGuarded(deps.pb, row.id, now);
          report.guarded += 1;
          continue;
        }
        due.push({ memberId, hash });
        rewrites.add(memberId);
      }
      if (due.length === 0) continue;

      const requests = due.map(({ memberId, hash }) => ({
        key: { leagueId: league.id, season: deps.season, round, kind: KIND, memberId },
        inputHash: hash,
        voice: VOICE,
        promptVersion: SCOUT_PROMPT_VERSION,
        facts: { version: facts.version, round, text: facts.sectionFor(memberId) },
      }));
      const outcome = await claimAndWrite(deps.pb, requests, { model: deps.model, now: deps.now, force: false }, async (claimed) => {
        report.calls += 1;
        const members = new Set(claimed);
        const result = await (deps.write ?? writeScoutReasons)({
          facts,
          moves: facts.moves.filter((move) => members.has(move.memberId)),
          model: deps.model,
          apiKey: deps.apiKey,
        });
        return {
          usage: result.usage,
          model: result.model,
          verdict: (memberId) => {
            const answer = result.byMember[memberId];
            return answer?.ok ? { ok: true, writeup: { reasons: answer.reasons }, refs: refsFor(facts, memberId) } : answer;
          },
        };
      });
      if (!outcome) continue;
      report.refused += outcome.refused.length;
      for (const memberId of outcome.written) {
        if (rewrites.has(memberId)) report.rewritten += 1;
        else report.written += 1;
      }
    }
  });
}
