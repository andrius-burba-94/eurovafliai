import { describeSweep, sweepTestData } from "./helpers/sweep";

/**
 * Sweep before the suite, not only after it.
 *
 * `afterEach` cleans the run it belongs to. This cleans the runs that never
 * got to: a killed suite, a crashed worker, a `Ctrl-C`, a laptop that slept.
 * Those leave players, leagues and users that no later `afterEach` can even
 * name, because the club code and the id registry died with the process.
 *
 * Running it **first** is what makes the guarantee useful: every suite starts
 * on a clean database whatever happened last time, so a spec can never assert
 * against a previous run's leftovers and the pool never grows over a week of
 * interrupted runs. The teardown pass is the belt; this is the braces.
 */
export default async function globalSetup(): Promise<void> {
  const swept = await sweepTestData();
  const line = describeSweep(swept, "before");
  // Silent when there was nothing to clean, which is the normal case. A line
  // here means the previous run did not finish.
  if (line) console.log(line);
}
