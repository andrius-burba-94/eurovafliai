import { CALLS_PER_PASS, runRoundPass, type PassReport, type RoundPassDeps } from "./round-pass";
import type { ScoutFactsInput } from "./scout-facts-store";
import { runScoutPass, type ScoutPassReport } from "./scout-pass";

/**
 * The fifteen-minute write-up pass — 7.1 round write-ups, 7.2 G reasons.
 *
 * The scout's reasons go first and spend from the same two calls: advice is
 * worth most early in a short window between rounds, and a round's write-up
 * that waits a pass loses nothing. Google saying "not now" to the scout ends
 * the whole pass, since the round write-up would only hear the same.
 */
export async function runWriteupPass(
  deps: RoundPassDeps & {
    readonly readScoutInput: (leagueId: string) => Promise<ScoutFactsInput | null>;
    readonly writeReasons?: Parameters<typeof runScoutPass>[0]["write"];
    readonly onScout?: (report: ScoutPassReport) => void;
    readonly onScoutError?: (error: unknown) => void;
  },
): Promise<PassReport> {
  // A scout fault is the scout's: the round write-ups still get their turn.
  let scout: ScoutPassReport;
  try {
    scout = await runScoutPass({
      pb: deps.pb,
      season: deps.season,
      apiKey: deps.apiKey,
      model: deps.model,
      now: deps.now,
      budget: CALLS_PER_PASS,
      readComplete: deps.readComplete,
      readInput: deps.readScoutInput,
      ...(deps.writeReasons ? { write: deps.writeReasons } : {}),
    });
  } catch (error) {
    deps.onScoutError?.(error);
    return runRoundPass(deps);
  }
  deps.onScout?.(scout);
  if (scout.stopped) return { written: 0, refused: 0, guarded: 0, rewritten: 0, stopped: scout.stopped };
  return runRoundPass(deps, { budget: CALLS_PER_PASS - scout.calls });
}
