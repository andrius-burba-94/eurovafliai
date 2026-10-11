import type PocketBase from "pocketbase";

import type { BriefFacts } from "./brief-facts";
import { BRIEF_PROMPT_VERSION, briefInput, briefRefs, writeBriefs } from "./briefs";
import { enabledLeagues, stopping } from "./round-pass";
import { claimWriteup, completeWriteup, failWriteup, MAX_ATTEMPTS, readMemberWriteups } from "./store";

/**
 * The worker's briefs pass — slice 7.3 B.
 *
 * For each league in season with write-ups on: one model call for every
 * member whose brief for the latest finished round is due, split into one
 * private `round_brief` row per member. Only the latest round is ever
 * written, so on deploy that round alone is the backfill. It runs after the
 * round write-up and before the scout's reasons, from the same two-calls-a-pass
 * budget (the caller passes what is left).
 *
 * Due means no row, or a failed one: the claim's own rules decide the rest (a
 * fresh claim is left to its writer, a stale one is taken over, and three
 * failures on one input stop asking). A league whose members are all written
 * or out of attempts is not read at all, so an exhausted brief waits for 7.3
 * E's re-guard rather than a changed sheet. Each member's row is claimed, then
 * completed or failed on its own, so a crash leaves only claims that go stale.
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
  refused: number;
  /** Leagues asked: what the pass spent of the shared budget. */
  calls: number;
  stopped: string | null;
};

export async function runBriefPass(deps: BriefPassDeps): Promise<BriefPassReport> {
  const report: BriefPassReport = { written: 0, refused: 0, calls: 0, stopped: null };
  if (!deps.apiKey) return { ...report, stopped: "no GEMINI_API_KEY" };

  for (const league of await enabledLeagues(deps.pb)) {
    if (report.calls >= deps.budget) break;
    const round = (await deps.readComplete(league.id)).at(-1);
    if (round === undefined) continue;
    const stored = new Map(
      (await readMemberWriteups(deps.pb, { leagueId: league.id, season: deps.season, round, kind: KIND })).map((row) => [row.member, row]),
    );
    const written = (memberId: string) => stored.get(memberId)?.status === "ready";
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
    const { voice } = league.ai;
    const now = deps.now();
    const claimed: { memberId: string; id: string }[] = [];
    for (const memberId of facts.memberIds) {
      if (written(memberId)) continue;
      const { text, inputHash } = briefInput(facts, memberId, { voice, model: deps.model });
      const claim = await claimWriteup(
        deps.pb,
        { leagueId: league.id, season: deps.season, round, kind: KIND, memberId },
        {
          inputHash,
          voice,
          model: deps.model,
          promptVersion: BRIEF_PROMPT_VERSION,
          facts: { version: facts.version, round, text },
          now,
        },
      );
      if (claim.outcome === "claimed") claimed.push({ memberId, id: claim.id });
    }
    if (claimed.length === 0) continue;

    report.calls += 1;
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
        writeup: outcome.brief,
        refs: briefRefs(facts, entry.memberId),
        usage: result.usage,
        model: result.model,
        now: deps.now(),
      });
      report.written += 1;
    }
  }
  return report;
}
