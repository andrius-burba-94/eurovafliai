import type PocketBase from "pocketbase";

import type { BriefFacts } from "./brief-facts";
import { BRIEF_PROMPT_VERSION, briefInput, briefRefs, reguardBrief, storedBrief, writeBriefs } from "./briefs";
import { enabledLeagues, latestCorrection, reguardDue, stopping } from "./round-pass";
import {
  claimWriteup,
  completeWriteup,
  failWriteup,
  instant,
  markGuarded,
  MAX_ATTEMPTS,
  readMemberWriteups,
  readRewriteRequests,
  STALE_AFTER_MS,
} from "./store";
import type { Voice } from "./voice";

/**
 * The worker's briefs pass — slices 7.3 B and 7.3 E.
 *
 * For each league in season with write-ups on, two jobs from the same
 * two-calls-a-pass budget (the caller passes what is left):
 *
 * 1. **Write** every member's brief for the latest finished round that is
 *    due, in one call per league. Only the latest round is ever written, so
 *    on deploy that round alone is the backfill. Due means no row, or a
 *    failed one: the claim's own rules decide the rest (a fresh claim is left
 *    to its writer, a stale one is taken over, and three failures on one input
 *    stop asking). A league with nothing left to ask is not read at all.
 * 2. **Re-guard** written briefs once a day and after a stat correction, as
 *    ADR-0013 (amended) says: the stored `result` and `standing` against the
 *    rebuilt sheet. A brief that still holds is marked; one that does not is
 *    rewritten whole, in the league's voice now, one call per league round.
 *    `next` is a forecast as of writing and is never checked.
 *
 * The commissioner's Rewrite this round is `writeRequestedBriefs`, on the
 * one-minute check. Each member's row is claimed, then completed or failed on
 * its own, so a crash leaves only claims that go stale and requests that
 * stand.
 */

const KIND = "round_brief" as const;

export type BriefPassDeps = {
  readonly pb: PocketBase;
  readonly season: string;
  readonly apiKey: string;
  readonly model: string;
  readonly now: () => number;
  /** Model calls this pass may make. */
  readonly budget: number;
  /** Finished rounds, ascending. */
  readonly readComplete: (leagueId: string) => Promise<readonly number[]>;
  /** The round's briefs sheet, or null when the reader refuses the round. */
  readonly readFacts: (leagueId: string, round: number) => Promise<BriefFacts | null>;
  readonly write?: typeof writeBriefs;
};

export type BriefPassReport = {
  written: number;
  /** Briefs written again: a re-guard found them false, or the commissioner asked. */
  rewritten: number;
  refused: number;
  guarded: number;
  /** Model calls made: what the pass spent of the shared budget. */
  calls: number;
  stopped: string | null;
};

/** Google said "not now": the claimed rows are failed and the pass ends. */
class PassStopped extends Error {}

/**
 * Claim the members' rows, ask once, finish each row on its own. Returns how
 * many were written and refused; `null` when nothing could be claimed, so no
 * call was made.
 */
async function writeMembers(
  deps: BriefPassDeps,
  { leagueId, voice, round, facts, memberIds, force }: {
    leagueId: string;
    voice: Voice;
    round: number;
    facts: BriefFacts;
    memberIds: readonly string[];
    force: boolean;
  },
): Promise<{ written: number; refused: number } | null> {
  const now = deps.now();
  const claimed: { memberId: string; id: string }[] = [];
  for (const memberId of memberIds) {
    const { text, inputHash } = briefInput(facts, memberId, { voice, model: deps.model });
    const claim = await claimWriteup(
      deps.pb,
      { leagueId, season: deps.season, round, kind: KIND, memberId },
      { inputHash, voice, model: deps.model, promptVersion: BRIEF_PROMPT_VERSION, facts: { version: facts.version, round, text }, now, force },
    );
    if (claim.outcome === "claimed") claimed.push({ memberId, id: claim.id });
  }
  if (claimed.length === 0) return null;

  let result: Awaited<ReturnType<typeof writeBriefs>>;
  try {
    result = await (deps.write ?? writeBriefs)({
      facts,
      memberIds: claimed.map((entry) => entry.memberId),
      voice,
      model: deps.model,
      apiKey: deps.apiKey,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const entry of claimed) await failWriteup(deps.pb, entry.id, message);
    if (stopping(error)) throw new PassStopped(message);
    throw error;
  }

  const outcome = { written: 0, refused: 0 };
  for (const entry of claimed) {
    const answer = result.byMember[entry.memberId];
    if (!answer || !answer.ok) {
      await failWriteup(deps.pb, entry.id, answer ? answer.violations.join("; ") : "no answer for this member", result.usage);
      outcome.refused += 1;
      continue;
    }
    await completeWriteup(deps.pb, entry.id, {
      writeup: answer.brief,
      refs: briefRefs(facts, entry.memberId),
      usage: result.usage,
      model: result.model,
      now: deps.now(),
    });
    outcome.written += 1;
  }
  return outcome;
}

const emptyReport = (): BriefPassReport => ({ written: 0, rewritten: 0, refused: 0, guarded: 0, calls: 0, stopped: null });

export async function runBriefPass(deps: BriefPassDeps): Promise<BriefPassReport> {
  const report = emptyReport();
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };

  try {
    const leagues = await enabledLeagues(deps.pb);

    // 1. The latest round's missing briefs.
    for (const league of leagues) {
      if (report.calls >= deps.budget) break;
      const round = (await deps.readComplete(league.id)).at(-1);
      if (round === undefined) continue;
      const stored = new Map(
        (await readMemberWriteups(deps.pb, { leagueId: league.id, season: deps.season, round, kind: KIND })).map((row) => [row.member, row]),
      );
      const settled = (memberId: string) => {
        const row = stored.get(memberId);
        return row?.status === "ready" || (row?.status === "failed" && (row.attempts ?? 0) >= MAX_ATTEMPTS);
      };
      // The sheet reads the season's box scores: a league with nothing left to ask needs none of it.
      const roster = await deps.pb
        .collection("league_members")
        .getFullList<{ id: string }>({ filter: `league = '${league.id}'`, fields: "id", requestKey: null });
      if (roster.every((member) => settled(member.id))) continue;

      const facts = await deps.readFacts(league.id, round);
      if (!facts) continue;
      const due = facts.memberIds.filter((memberId) => stored.get(memberId)?.status !== "ready");
      const outcome = await writeMembers(deps, { leagueId: league.id, voice: league.ai.voice, round, facts, memberIds: due, force: false });
      if (!outcome) continue;
      report.calls += 1;
      report.written += outcome.written;
      report.refused += outcome.refused;
    }

    // 2. Re-guard what is written: daily, or since the last correction.
    const corrected = await latestCorrection(deps.pb);
    const now = deps.now();
    for (const league of leagues) {
      const rows = await readMemberWriteups(deps.pb, { leagueId: league.id, season: deps.season, kind: KIND });
      const dueByRound = new Map<number, typeof rows>();
      for (const row of rows) {
        if (row.status !== "ready" || !storedBrief(row.output) || !reguardDue(row, now, corrected)) continue;
        dueByRound.set(row.round, [...(dueByRound.get(row.round) ?? []), row]);
      }
      for (const [round, due] of dueByRound) {
        const facts = await deps.readFacts(league.id, round);
        if (!facts) continue;
        const broken: string[] = [];
        for (const row of due) {
          if (reguardBrief(facts, row.member, storedBrief(row.output)!).length === 0) {
            await markGuarded(deps.pb, row.id, now);
            report.guarded += 1;
          } else {
            broken.push(row.member);
          }
        }
        // Unmarked, a false brief is checked again on the next pass, and rewritten when a call is left.
        if (broken.length === 0 || report.calls >= deps.budget) continue;
        const outcome = await writeMembers(deps, { leagueId: league.id, voice: league.ai.voice, round, facts, memberIds: broken, force: true });
        if (!outcome) continue;
        report.calls += 1;
        report.rewritten += outcome.written;
        report.refused += outcome.refused;
      }
    }
  } catch (error) {
    if (error instanceof PassStopped) return { ...report, stopped: error.message };
    throw error;
  }
  return report;
}

/**
 * The commissioner's Rewrite this round, for the briefs — 7.3 E. One call per
 * league round for every requested brief, in the league's voice now. A
 * request stays standing in a league with write-ups off, and while a fresh
 * claim is writing the row; a claim that went stale (the worker died
 * mid-write) is taken over.
 */
export async function writeRequestedBriefs(deps: BriefPassDeps): Promise<BriefPassReport> {
  const report = emptyReport();
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };
  const now = deps.now();
  const requests = (await readRewriteRequests(deps.pb)).filter(
    (row) =>
      row.kind === KIND &&
      row.member &&
      row.season === deps.season &&
      !(row.status === "pending" && now - instant(row.claimed_at) < STALE_AFTER_MS),
  );
  if (requests.length === 0) return report;

  const leagues = new Map((await enabledLeagues(deps.pb)).map((league) => [league.id, league]));
  const byRound = new Map<string, typeof requests>();
  for (const row of requests) {
    if (!leagues.has(row.league)) continue;
    const key = `${row.league}:${row.round}`;
    byRound.set(key, [...(byRound.get(key) ?? []), row]);
  }

  try {
    for (const rows of byRound.values()) {
      if (report.calls >= deps.budget) break;
      const { league: leagueId, round } = rows[0]!;
      const facts = await deps.readFacts(leagueId, round);
      if (!facts) continue;
      const outcome = await writeMembers(deps, {
        leagueId,
        voice: leagues.get(leagueId)!.ai.voice,
        round,
        facts,
        memberIds: rows.map((row) => row.member),
        force: true,
      });
      if (!outcome) continue;
      report.calls += 1;
      report.rewritten += outcome.written;
      report.refused += outcome.refused;
    }
  } catch (error) {
    if (error instanceof PassStopped) return { ...report, stopped: error.message };
    throw error;
  }
  return report;
}
