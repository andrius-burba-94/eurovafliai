import type { BriefFacts } from "./brief-facts";
import { runBriefPass, type BriefPassReport } from "./brief-pass";
import { CALLS_PER_PASS, runRoundPass, type PassReport, type RoundPassDeps } from "./round-pass";
import type { ScoutFactsInput } from "./scout-facts-store";
import { runScoutPass, type ScoutPassReport } from "./scout-pass";
import { writeRoundSummary } from "./summary";

/**
 * The fifteen-minute write-up pass — 7.1 round write-ups, 7.2 G reasons,
 * 7.3 B briefs.
 *
 * Three jobs spend from the same two calls, in this order: the round's
 * write-up, then every member's brief, then the scout's reasons. The league's
 * story lands first and each member's own round right behind it; reasons
 * that wait a pass still arrive well inside the window between rounds.
 * (7.2 ran the scout first; 7.3 reversed it.) Google saying "not now" to one
 * ends the whole pass, since the next would only hear the same.
 *
 * A fault in one job is that job's: the others still get their turn. The
 * round pass's fault is thrown once the others are done, so the worker logs
 * it and re-authenticates as before; the briefs' and the scout's are reported.
 */
export async function runWriteupPass(
  deps: RoundPassDeps & {
    readonly readBriefFacts: (leagueId: string, round: number) => Promise<BriefFacts | null>;
    readonly writeBriefs?: Parameters<typeof runBriefPass>[0]["write"];
    readonly onBriefs?: (report: BriefPassReport) => void;
    readonly onBriefsError?: (error: unknown) => void;
    readonly readScoutInput: (leagueId: string) => Promise<ScoutFactsInput | null>;
    readonly writeReasons?: Parameters<typeof runScoutPass>[0]["write"];
    readonly onScout?: (report: ScoutPassReport) => void;
    readonly onScoutError?: (error: unknown) => void;
  },
): Promise<PassReport> {
  // Counted at the door, so a round pass that throws midway still leaves an honest budget.
  let budget = CALLS_PER_PASS;
  const write = deps.write ?? writeRoundSummary;
  let rounds: PassReport = { written: 0, refused: 0, guarded: 0, rewritten: 0, stopped: null };
  let roundFault: { readonly error: unknown } | null = null;
  try {
    rounds = await runRoundPass({
      ...deps,
      write: (args) => {
        budget -= 1;
        return write(args);
      },
    });
  } catch (error) {
    roundFault = { error };
  }
  if (rounds.stopped) return rounds;

  const shared = { pb: deps.pb, season: deps.season, apiKey: deps.apiKey, model: deps.model, now: deps.now, readComplete: deps.readComplete };
  try {
    const briefs = await runBriefPass({
      ...shared,
      budget,
      readFacts: deps.readBriefFacts,
      ...(deps.writeBriefs ? { write: deps.writeBriefs } : {}),
    });
    deps.onBriefs?.(briefs);
    budget -= briefs.calls;
    if (briefs.stopped) rounds = { ...rounds, stopped: briefs.stopped };
  } catch (error) {
    deps.onBriefsError?.(error);
  }

  if (!rounds.stopped) {
    try {
      const scout = await runScoutPass({
        ...shared,
        budget,
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
