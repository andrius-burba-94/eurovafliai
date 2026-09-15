import { execFileSync } from "node:child_process";

import { describeSweep, sweepTestData } from "./helpers/sweep";

/**
 * Is another process enforcing pick deadlines right now?
 *
 * It matters because **the suite is the only thing allowed to move a draft on**
 * while it runs. Several specs assert what happens when a deadline passes and
 * *nothing* takes the pick, and several others drive `sweepOnce` by hand and
 * count what it did. A live worker breaks both: it autopicks first, so the
 * hand-driven tick reports `0 autopicked`, and the expired pick it takes means
 * the room never reaches the stalled state it is being asked about.
 *
 * This was not a hazard until `npm run dev` started including the worker — the
 * right change, because a forgotten worker cost a whole local draft its
 * autodraft. But it means the ordinary way to have the app running is now also
 * the way to make the suite lie. Two strays produced three failures that looked
 * like regressions and were not.
 *
 * So the suite refuses rather than guesses. A loud line naming the process
 * beats three mystery failures and an afternoon.
 *
 * `CI` never has one — Playwright starts `next start` there and nothing else —
 * so this is a local-development guard, which is why a `ps` is enough and no
 * heartbeat column was added to the database for it.
 */
function workerPids(): string[] {
  try {
    const out = execFileSync("ps", ["-eo", "pid=,args="], {
      encoding: "utf8",
    });
    return out
      .split("\n")
      .filter((line) => line.includes("src/worker/index.ts"))
      .map((line) => line.trim().split(/\s+/)[0]!)
      .filter(Boolean);
  } catch {
    // No `ps`, or a platform that spells it differently. Not worth failing a
    // whole suite over a guard.
    return [];
  }
}

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
  const pids = workerPids();
  if (pids.length > 0) {
    throw new Error(
      [
        `Refusing to run: ${pids.length} worker process(es) are enforcing pick deadlines (pid ${pids.join(", ")}).`,
        "",
        "The suite has to be the only thing moving a draft on. A live worker",
        "autopicks before the specs that drive the sweep by hand, and takes the",
        "expired picks the specs about a stalled room are asking about.",
        "",
        `Stop it and re-run:  kill ${pids.join(" ")}`,
        "`npm run dev` starts one now, so this is the usual cause.",
      ].join("\n"),
    );
  }

  const swept = await sweepTestData();
  const line = describeSweep(swept, "before");
  // Silent when there was nothing to clean, which is the normal case. A line
  // here means the previous run did not finish.
  if (line) console.log(line);
}
