/**
 * Eurovafliai worker — the second PM2 app, and the only process that enforces
 * a deadline.
 *
 * Every second it runs one `sweepOnce` (see `./sweep.ts`, which is where the
 * rules live): autodraft for whoever is out of time or has armed it, plus the
 * three repairs that no request-driven code path would ever notice. This
 * process holds no draft state of its own — it reads PocketBase, asks the pure
 * engine, and writes through the same pick pipeline a tapped button uses.
 *
 * Two properties are deliberate, and both are invariant §7 (degradation is a
 * feature):
 *
 * - **Killing it corrupts nothing.** Timers stop being enforced and the
 *   commissioner can still enter every pick by hand. A tick that dies between
 *   its two writes leaves the one state ADR-0003 made repairable, and the next
 *   tick — or the next human pick — repairs it.
 * - **It is idempotent by tick.** Nothing accumulates across ticks except a set
 *   of problems already complained about, so a restart loses nothing but log
 *   continuity.
 *
 * It deliberately does NOT import `@/lib/config/server` — that module pulls in
 * `server-only`, which throws outside a React Server Component graph. The
 * schema module is pure and safe to use from plain Node, which is the same
 * reason `./sweep.ts` may import the pick pipeline but not the server actions
 * that wrap it.
 *
 * Phase 4.3 adds the nightly stats fetch and standings recompute to this file,
 * on a much slower cadence than the pick sweep.
 */
import PocketBase from "pocketbase";

import { parseServerEnv, type ServerEnv } from "@/lib/config/schema";

import { describeError } from "@/lib/drafts/pipeline";

import { eventCount, sweepOnce, type SweepReport } from "./sweep";

/**
 * A second. The blueprint's figure, and the right one: it is the difference
 * between "the clock hit zero and the pick appeared" and "the clock hit zero
 * and we waited". Each quiet tick is one indexed query against a local SQLite
 * file, so the cost of being prompt is nothing.
 */
const TICK_MS = 1_000;
/** Five minutes. Proof of life for a process that is silent when all is well. */
const HEARTBEAT_EVERY_TICKS = 300;
/**
 * How long a tick may be in flight before the log says so.
 *
 * A tick is a handful of queries against a local SQLite file, so thirty seconds
 * is not slow, it is wedged — PocketBase accepting a connection and then not
 * answering, most likely. The process is *alive* in that state, which is what
 * makes it dangerous: PM2 reports it online, `deploy.sh` agrees, and no pick
 * deadline is being enforced. That is exactly the "looks perfectly healthy and
 * never times anybody out" failure the sweep exists to repair, so the worker
 * must not be able to fall into it silently.
 */
const STALL_AFTER_MS = 30_000;
/** A minute of consecutive failures between complaints — PocketBase being down should not fill the disk. */
const FAILURE_LOG_EVERY = 60;

function log(message: string): void {
  console.log(`[worker] ${new Date().toISOString()} ${message}`);
}

/** A one-line summary of a tick that actually did something. */
function summarise(report: SweepReport): string {
  const parts: string[] = [];
  if (report.autopicked) parts.push(`${report.autopicked} autopicked`);
  if (report.raced) parts.push(`${report.raced} raced`);
  if (report.repaired) parts.push(`${report.repaired} repaired`);
  if (report.finished) parts.push(`${report.finished} finished`);
  if (report.clocksRestarted) parts.push(`${report.clocksRestarted} clocks restarted`);
  if (report.stuck) parts.push(`${report.stuck} stuck`);
  if (report.moved) parts.push(`${report.moved} moved`);
  if (report.failed) parts.push(`${report.failed} failed`);
  return `tick · ${report.live} live · ${parts.join(", ")}`;
}

/**
 * Authenticate only when the token will not do.
 *
 * `authStore.isValid` reads the JWT's own expiry, so this re-authenticates
 * across a token lifetime without a timer of its own — and after a failed tick,
 * which clears the store precisely so that an expired token and a PocketBase
 * restart both heal the same way.
 */
async function ensureAuth(pb: PocketBase, env: ServerEnv): Promise<void> {
  if (pb.authStore.isValid) return;
  await pb
    .collection("_superusers")
    .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);
  log("authenticated as superuser");
}

function main(): void {
  const env = parseServerEnv(process.env);
  const pb = new PocketBase(env.PB_INTERNAL_URL);
  log(`starting · PocketBase ${env.PB_INTERNAL_URL} · tick ${TICK_MS}ms`);

  /**
   * Drafts the sweep has already complained about. Lives out here so that a
   * draft it cannot help is reported once rather than once a second; the cost
   * is a set of a few strings that a restart clears.
   */
  const reported = new Set<string>();
  /** Intervals fired — counted out here, so a stuck tick cannot stop the count. */
  let ticks = 0;
  let failures = 0;
  let inFlight: Promise<void> | null = null;
  let startedAt = 0;
  let stallReported = false;
  /** The last count the sweep saw, for the heartbeat to quote. */
  let live = 0;
  let stopping = false;

  async function tick(): Promise<void> {
    try {
      await ensureAuth(pb, env);
      const report = await sweepOnce({
        pb,
        // The wall clock, asked for wherever the sweep needs it — not sampled
        // once here, where it would already be stale by the time a deadline
        // gets stamped from it.
        clock: () => new Date(),
        log,
        reported,
      });

      // Every action the sweep takes has already logged itself, naming the
      // draft, the member and the player. The summary only earns its line when
      // one tick did several things — two leagues drafting at once, a repair
      // alongside a pick — which is when those lines stop reading in sequence.
      if (eventCount(report) > 1) log(summarise(report));
      live = report.live;
      if (failures > 0) {
        log(`recovered after ${failures} failed tick(s)`);
        failures = 0;
      }
    } catch (error) {
      failures += 1;
      if (failures === 1 || failures % FAILURE_LOG_EVERY === 0) {
        log(`tick failed (${failures} in a row): ${describeError(error)}`);
      }
      // Most whole-tick failures are PocketBase being unreachable or a token
      // that has expired, and the two are indistinguishable from here. Dropping
      // the auth makes the next tick re-authenticate, so both recover without a
      // restart.
      pb.authStore.clear();
    }
  }

  const timer = setInterval(() => {
    if (stopping) return;
    ticks += 1;

    // Proof of life belongs out here rather than inside the tick. A tick that
    // never returns would otherwise silence the process completely — no
    // heartbeat, because the line never runs; no failure, because nothing
    // threw — while every outside observer still calls it healthy.
    if (ticks % HEARTBEAT_EVERY_TICKS === 0) {
      log(`heartbeat · ${ticks} ticks · ${live} live draft(s)`);
    }

    // A tick that overran its second must not stack another on top of itself:
    // two sweeps in flight would both read "nobody has picked yet" and race
    // each other into the same slot. The unique index would refuse the second,
    // but the right answer is not to start it.
    if (inFlight) {
      const stalledMs = Date.now() - startedAt;
      if (
        stalledMs >= STALL_AFTER_MS &&
        (!stallReported || ticks % HEARTBEAT_EVERY_TICKS === 0)
      ) {
        stallReported = true;
        log(
          `a tick has been in flight for ${Math.round(stalledMs / 1000)}s — ` +
            `NO pick deadline is being enforced. PocketBase is probably wedged.`,
        );
      }
      return;
    }

    startedAt = Date.now();
    inFlight = tick().finally(() => {
      inFlight = null;
      stallReported = false;
    });
  }, TICK_MS);

  async function shutdown(signal: string): Promise<void> {
    if (stopping) return;
    stopping = true;
    clearInterval(timer);
    log(`${signal} received, finishing the tick in flight`);
    // PM2 sends SIGTERM on reload and waits before escalating. A tick is a
    // handful of local queries, so this returns immediately in practice — and
    // if it does not, being killed mid-tick costs at most one repairable pick.
    await inFlight?.catch(() => {});
    log("stopped");
    process.exit(0);
  }

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}

main();
