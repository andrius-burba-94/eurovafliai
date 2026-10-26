import type PocketBase from "pocketbase";

import type { BriefFacts } from "./brief-facts";
import { BRIEF_PROMPT_VERSION, briefInput, briefRefs, reguardBrief, storedBrief, writeBriefs, type BriefLines } from "./briefs";
import { claimAndWrite, enabledLeagues, latestCorrection, reguardDue, untilStopped, type League, type RewriteReads } from "./round-pass";
import { isFreshClaim, markGuarded, notDue, readMemberWriteups, readRewriteRequests } from "./store";
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
  /** Read once for the whole fifteen-minute pass by `runWriteupPass`. */
  readonly leagues?: readonly League[];
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

/**
 * Claim the members' rows, ask once, finish each row on its own. The call is
 * counted before it is made, so one that throws still spends the budget. A
 * forced write is a rewrite: a false brief, or the commissioner asked.
 */
async function writeMembers(
  deps: Omit<BriefPassDeps, "readComplete">,
  report: BriefPassReport,
  { leagueId, voice, round, facts, memberIds, force }: { leagueId: string; voice: Voice; round: number; facts: BriefFacts; memberIds: readonly string[]; force: boolean },
): Promise<void> {
  const requests = memberIds.map((memberId) => {
    const { text, inputHash } = briefInput(facts, memberId, { voice, model: deps.model });
    return {
      key: { leagueId, season: deps.season, round, kind: KIND, memberId },
      inputHash,
      voice,
      promptVersion: BRIEF_PROMPT_VERSION,
      facts: { version: facts.version, round, text },
    };
  });
  const outcome = await claimAndWrite(deps.pb, requests, { model: deps.model, now: deps.now, force }, async (claimed) => {
    report.calls += 1;
    const result = await (deps.write ?? writeBriefs)({ facts, memberIds: claimed, voice, model: deps.model, apiKey: deps.apiKey });
    return {
      usage: result.usage,
      model: result.model,
      verdict: (memberId) => {
        const answer = result.byMember[memberId];
        return answer?.ok ? { ok: true, writeup: answer.brief, refs: briefRefs(facts, memberId) } : answer;
      },
    };
  });
  if (!outcome) return;
  if (force) report.rewritten += outcome.written.length;
  else report.written += outcome.written.length;
  report.refused += outcome.refused.length;
}

const emptyReport = (): BriefPassReport => ({ written: 0, rewritten: 0, refused: 0, guarded: 0, calls: 0, stopped: null });

export async function runBriefPass(deps: BriefPassDeps): Promise<BriefPassReport> {
  const report = emptyReport();
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };
  const now = deps.now();

  return untilStopped(report, async () => {
    const leagues = deps.leagues ?? (await enabledLeagues(deps.pb));

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
        return row !== undefined && (row.status === "ready" || notDue(row, now));
      };
      // The sheet reads the season's box scores: a league with nothing left to ask needs none of it.
      const roster = await deps.pb
        .collection("league_members")
        .getFullList<{ id: string }>({ filter: `league = '${league.id}'`, fields: "id", requestKey: null });
      if (roster.every((member) => settled(member.id))) continue;

      const facts = await deps.readFacts(league.id, round);
      if (!facts) continue;
      const due = facts.memberIds.filter((memberId) => !settled(memberId));
      await writeMembers(deps, report, { leagueId: league.id, voice: league.ai.voice, round, facts, memberIds: due, force: false });
    }

    // 2. Re-guard what is written: daily, or since the last correction.
    const corrected = await latestCorrection(deps.pb);
    for (const league of leagues) {
      const rows = await readMemberWriteups(deps.pb, { leagueId: league.id, season: deps.season, kind: KIND });
      const dueByRound = new Map<number, { member: string; id: string; brief: BriefLines }[]>();
      for (const row of rows) {
        const brief = row.status === "ready" ? storedBrief(row.output) : null;
        if (!brief || !reguardDue(row, now, corrected)) continue;
        dueByRound.set(row.round, [...(dueByRound.get(row.round) ?? []), { member: row.member, id: row.id, brief }]);
      }
      for (const [round, due] of dueByRound) {
        const facts = await deps.readFacts(league.id, round);
        if (!facts) continue;
        const broken: string[] = [];
        for (const row of due) {
          if (reguardBrief(facts, row.member, row.brief).length === 0) {
            await markGuarded(deps.pb, row.id, now);
            report.guarded += 1;
          } else {
            broken.push(row.member);
          }
        }
        // Unmarked, a false brief is checked again on the next pass, and rewritten when a call is left.
        if (broken.length === 0 || report.calls >= deps.budget) continue;
        await writeMembers(deps, report, { leagueId: league.id, voice: league.ai.voice, round, facts, memberIds: broken, force: true });
      }
    }
  });
}

/**
 * The commissioner's Rewrite this round, for the briefs — 7.3 E. One call per
 * league round for every requested brief, in the league's voice now. A
 * request stays standing in a league with write-ups off, and while a fresh
 * claim is writing the row; a claim that went stale (the worker died
 * mid-write) is taken over.
 */
export async function writeRequestedBriefs(
  deps: Omit<BriefPassDeps, "readComplete" | "leagues">,
  reads: Partial<RewriteReads> = {},
): Promise<BriefPassReport> {
  const report = emptyReport();
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };
  const now = deps.now();
  const requests = (reads.requests ?? (await readRewriteRequests(deps.pb))).filter(
    (row) => row.kind === KIND && row.member && row.season === deps.season && !isFreshClaim(row, now),
  );
  if (requests.length === 0) return report;

  const leagues = new Map((reads.leagues ?? (await enabledLeagues(deps.pb))).map((league) => [league.id, league]));
  const byRound = new Map<string, typeof requests>();
  for (const row of requests) {
    if (!leagues.has(row.league)) continue;
    const key = `${row.league}:${row.round}`;
    byRound.set(key, [...(byRound.get(key) ?? []), row]);
  }

  return untilStopped(report, async () => {
    for (const rows of byRound.values()) {
      if (report.calls >= deps.budget) return;
      const { league: leagueId, round } = rows[0]!;
      const facts = await deps.readFacts(leagueId, round);
      if (!facts) continue;
      const memberIds = rows.map((row) => row.member);
      await writeMembers(deps, report, { leagueId, voice: leagues.get(leagueId)!.ai.voice, round, facts, memberIds, force: true });
    }
  });
}
