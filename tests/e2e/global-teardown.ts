import { describeSweep, sweepTestData } from "./helpers/sweep";

/**
 * Sweep after the suite.
 *
 * `afterEach` has already removed what each spec made, so this normally finds
 * nothing. It exists for what `afterEach` cannot reach: a spec that failed
 * before its cleanup ran, a worker that died mid-test, and any row a helper
 * created without tracking it.
 *
 * It cannot help a run that is *killed* — nothing can, which is why
 * `global-setup.ts` exists.
 */
export default async function globalTeardown(): Promise<void> {
  const swept = await sweepTestData();
  const line = describeSweep(swept, "after");
  if (line) console.log(line);
}
