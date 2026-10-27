import type { BriefFacts } from "./brief-facts";
import { runBriefPass, writeRequestedBriefs, type BriefPassReport } from "./brief-pass";
import { CALLS_PER_PASS, enabledLeagues, runRoundPass, writeRequestedRounds, type PassReport, type RoundPassDeps } from "./round-pass";
import type { ScoutFactsInput } from "./scout-facts-store";
import { runScoutPass, type ScoutPassReport } from "./scout-pass";
import { writeBriefs } from "./briefs";
import { readRewriteRequests, releaseStaleClaims } from "./store";
import { writeRoundSummary } from "./summary";

/** One pass's model calls, each taken as it is made: a call that throws midway still spends one. */
function callBudget() {
  let left = CALLS_PER_PASS;
  return {
    left: () => left,
    spend:
      <A, R>(call: (args: A) => Promise<R>) =>
      (args: A) => {
        left -= 1;
        return call(args);
      },
  };
}

type BriefDeps = {
  readonly readBriefFacts: (leagueId: string, round: number) => Promise<BriefFacts | null>;
  readonly writeBriefs?: Parameters<typeof runBriefPass>[0]["write"];
  readonly onBriefs?: (report: BriefPassReport) => void;
  readonly onBriefsError?: (error: unknown) => void;
};

/**
 * The fifteen-minute write-up pass — 7.1 round write-ups, 7.2 G reasons,
 * 7.3 B briefs (re-guarded since 7.3 E).
 *
 * Three jobs spend from the same two calls, in this order: the round's
 * write-up, then every member's brief, then the scout's reasons. The league's
 * story lands first and each member's own round right behind it; reasons
 * that wait a pass still arrive well inside the window between rounds.
 * Google saying "not now" to one ends the whole pass, since the next would
 * only hear the same.
 *
 * A fault in one job is that job's: the others still get their turn. The
 * round pass's fault is thrown once the others are done, so the worker logs
 * it and re-authenticates as before; the briefs' and the scout's are reported.
 *
 * The pass first puts back what a dead writer left pending, then reads the
 * leagues once and each league's finished rounds at most once for all three.
 */
export async function runWriteupPass(
  deps: RoundPassDeps &
    BriefDeps & {
      readonly readScoutInput: (leagueId: string) => Promise<ScoutFactsInput | null>;
      readonly writeReasons?: Parameters<typeof runScoutPass>[0]["write"];
      readonly onScout?: (report: ScoutPassReport) => void;
      readonly onScoutError?: (error: unknown) => void;
    },
): Promise<PassReport> {
  const budget = callBudget();
  await releaseStaleClaims(deps.pb, deps.now());
  const leagues = await enabledLeagues(deps.pb);
  const complete = new Map<string, Promise<readonly number[]>>();
  const readComplete = (leagueId: string) => complete.get(leagueId) ?? complete.set(leagueId, deps.readComplete(leagueId)).get(leagueId)!;

  let rounds: PassReport = { written: 0, refused: 0, guarded: 0, rewritten: 0, stopped: null };
  let roundFault: { readonly error: unknown } | null = null;
  try {
    rounds = await runRoundPass({ ...deps, readComplete, write: budget.spend(deps.write ?? writeRoundSummary) }, { leagues });
  } catch (error) {
    roundFault = { error };
  }
  if (rounds.stopped) return rounds;

  const shared = { pb: deps.pb, season: deps.season, apiKey: deps.apiKey, model: deps.model, now: deps.now, readComplete, leagues };
  try {
    const briefs = await runBriefPass({
      ...shared,
      budget: budget.left(),
      readFacts: deps.readBriefFacts,
      write: budget.spend(deps.writeBriefs ?? writeBriefs),
    });
    deps.onBriefs?.(briefs);
    if (briefs.stopped) rounds = { ...rounds, stopped: briefs.stopped };
  } catch (error) {
    deps.onBriefsError?.(error);
  }

  if (!rounds.stopped) {
    try {
      const scout = await runScoutPass({
        ...shared,
        budget: budget.left(),
        readInput: deps.readScoutInput,
        ...(deps.writeReasons ? { write: deps.writeReasons } : {}),
      });
      deps.onScout?.(scout);
    } catch (error) {
      deps.onScoutError?.(error);
    }
  }

  if (roundFault) throw roundFault.error;
  return rounds;
}

/**
 * The one-minute check for the commissioner's Rewrite this round (ADR-0013,
 * as amended): the round's write-up, then that round's briefs, from one
 * minute's two calls. A fault in the briefs is theirs; the round's report is
 * what the worker logs. The requests are read once, and the leagues only when
 * there is one.
 */
export async function runRequestedRewrites(deps: RoundPassDeps & BriefDeps): Promise<PassReport> {
  const requests = await readRewriteRequests(deps.pb);
  if (requests.length === 0) return { written: 0, refused: 0, guarded: 0, rewritten: 0, stopped: null };
  const reads = { requests, leagues: await enabledLeagues(deps.pb) };
  const budget = callBudget();
  const rounds = await writeRequestedRounds({ ...deps, write: budget.spend(deps.write ?? writeRoundSummary) }, reads);
  if (rounds.stopped || budget.left() <= 0) return rounds;
  try {
    const briefs = await writeRequestedBriefs({
      pb: deps.pb,
      season: deps.season,
      apiKey: deps.apiKey,
      model: deps.model,
      now: deps.now,
      budget: budget.left(),
      readFacts: deps.readBriefFacts,
      write: budget.spend(deps.writeBriefs ?? writeBriefs),
    }, reads);
    deps.onBriefs?.(briefs);
    if (briefs.stopped) return { ...rounds, stopped: briefs.stopped };
  } catch (error) {
    deps.onBriefsError?.(error);
  }
  return rounds;
}
