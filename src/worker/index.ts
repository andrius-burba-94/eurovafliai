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
 * **4.3 added the stats fetch**, on its own much slower cadence: every fifteen
 * minutes, one pass that asks the Euroleague feed what has been played and
 * imports whatever is not stored yet (`src/lib/stats/ingest.ts`). It gets its
 * own in-flight guard rather than sharing the sweep's, because the two must not
 * be able to block each other: a stats pass talks to somebody else's API over
 * the network and can take seconds, and no pick deadline may wait on that.
 * Standings recompute joins it in 4.5.
 *
 * **9.4 added the news pass**, hourly, on a third guard for the same reason —
 * it reads two of somebody else's web pages, which is the slowest and least
 * predictable thing this process does, and neither a pick deadline nor a box
 * score may queue behind it.
 */
import PocketBase from "pocketbase";

import { parseServerEnv, type ServerEnv } from "@/lib/config/schema";

import { describeError } from "@/lib/drafts/pipeline";

import { ingestNews, summariseNews } from "@/lib/news/ingest";
import { fetchSeasonAverages } from "@/lib/stats/euroleague";
import { ingestFinishedGames, summariseIngest } from "@/lib/stats/ingest";
import { previousSeasonOf } from "@/lib/stats/seasons";
import { applyPreviousSeason } from "@/lib/stats/store";

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
/**
 * A quarter of an hour between stats passes.
 *
 * The cadence question was "nightly, or often": often wins, because a Tuesday
 * game that ends at 22:00 is argued about at 22:05 and a nightly job would
 * have nothing to say until morning. The cost is one schedule request per
 * pass — four an hour, against a feed that starts refusing somewhere past a
 * hundred in a few minutes — and a pass with nothing to do makes exactly that
 * one request and writes nothing at all.
 */
const STATS_EVERY_MS = 15 * 60_000;
/**
 * A minute after boot, not immediately.
 *
 * A deploy reloads both PM2 apps at once, and the first seconds after one are
 * the busiest this box gets. Nothing about a box score is urgent to the
 * second, so it waits for the deploy to settle.
 */
const STATS_FIRST_AFTER_MS = 60_000;
/**
 * An hour between news passes, and ninety seconds after boot.
 *
 * Slower than the stats pass on purpose. Both pages carry the latest 25 items
 * and a publisher does not post twenty-four times a day, so a quarter-hourly
 * read would be ninety-six requests a day to learn the same thing four times
 * over. An injury note arriving within the hour is well inside "before anybody
 * sets a lineup".
 */
const NEWS_EVERY_MS = 60 * 60_000;
const NEWS_FIRST_AFTER_MS = 90_000;

function log(message: string, level: "info" | "warn" | "error" = "info"): void {
  const line = JSON.stringify({
    time: new Date().toISOString(),
    level,
    service: "eurovafliai-worker",
    message,
  });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

/** A one-line summary of a tick that actually did something. */
function summarise(report: SweepReport): string {
  const parts: string[] = [];
  if (report.autopicked) parts.push(`${report.autopicked} autopicked`);
  if (report.raced) parts.push(`${report.raced} raced`);
  if (report.repaired) parts.push(`${report.repaired} repaired`);
  if (report.finished) parts.push(`${report.finished} finished`);
  if (report.clocksRestarted)
    parts.push(`${report.clocksRestarted} clocks restarted`);
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
  /**
   * Consecutive thrown ticks per draft. Same lifetime as `reported`: a restart
   * clears it, and three throws in a row is what marks the draft stuck for the
   * commissioner (slice 8.2).
   */
  const failures = new Map<string, number>();
  /** Intervals fired — counted out here, so a stuck tick cannot stop the count. */
  let ticks = 0;
  let tickFailures = 0;
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
        failures,
      });

      // Every action the sweep takes has already logged itself, naming the
      // draft, the member and the player. The summary only earns its line when
      // one tick did several things — two leagues drafting at once, a repair
      // alongside a pick — which is when those lines stop reading in sequence.
      if (eventCount(report) > 1) log(summarise(report));
      live = report.live;
      if (tickFailures > 0) {
        log(`recovered after ${tickFailures} failed tick(s)`);
        tickFailures = 0;
      }
    } catch (error) {
      tickFailures += 1;
      if (tickFailures === 1 || tickFailures % FAILURE_LOG_EVERY === 0) {
        log(
          `tick failed (${tickFailures} in a row): ${describeError(error)}`,
          "error",
        );
      }
      // Most whole-tick failures are PocketBase being unreachable or a token
      // that has expired, and the two are indistinguishable from here. Dropping
      // the auth makes the next tick re-authenticate, so both recover without a
      // restart.
      pb.authStore.clear();
    }
  }

  /**
   * The stats pass, on its own guard.
   *
   * `statsInFlight` is deliberately not the sweep's `inFlight`: a pass that
   * hangs on a slow feed response must not stop pick deadlines being enforced,
   * and a sweep must not delay a pass. The two share only the PocketBase
   * client and its auth.
   */
  let statsInFlight: Promise<void> | null = null;
  let statsFailures = 0;

  async function statsPass(): Promise<void> {
    try {
      await ensureAuth(pb, env);
      const report = await ingestFinishedGames({
        pb,
        season: env.EUROLEAGUE_SEASON,
        log,
      });
      // A pass with nothing to do says nothing. Through most of a week that is
      // every pass, and a line saying "0 games" four times an hour would make
      // the log useless for the thing it is for.
      if (report.attempted > 0 || report.problems.length > 0) {
        log(summariseIngest(report));
        // Every problem, not a count: an unmatched person code is 4.2's input
        // and a PIR that disagrees with its own components is a rulebook
        // change. Both want to be read, not tallied.
        for (const problem of report.problems.slice(0, 20)) {
          log(`stats · ${problem}`, "warn");
        }
        if (report.problems.length > 20) {
          log(`stats · …and ${report.problems.length - 20} more problem(s)`);
        }
      }
      if (statsFailures > 0) {
        log(`stats recovered after ${statsFailures} failed pass(es)`);
        statsFailures = 0;
      }
    } catch (error) {
      statsFailures += 1;
      // Every failure is logged, unlike the sweep's — a pass happens four times
      // an hour rather than 3,600, so there is no flood to throttle, and the
      // feed being down for a day is worth twenty-four lines. The batch record
      // is deliberately absent here: `ingestFinishedGames` throws before it
      // writes one, so nothing claims an import that never ran.
      log(
        `stats pass failed (${statsFailures} in a row): ${describeError(error)}`,
        "error",
      );
      pb.authStore.clear();
    }
  }

  function scheduleStats(): void {
    if (env.STATS_FETCH === "off") {
      log("stats fetch is off (STATS_FETCH=off) — box scores will not import");
      return;
    }
    log(
      `stats fetch on · ${env.EUROLEAGUE_SEASON} · every ${STATS_EVERY_MS / 60_000}min`,
    );
    const run = () => {
      if (stopping || statsInFlight) return;
      statsInFlight = statsPass().finally(() => {
        statsInFlight = null;
      });
    };
    setTimeout(() => {
      run();
      statsTimer = setInterval(run, STATS_EVERY_MS);
    }, STATS_FIRST_AFTER_MS).unref?.();
  }

  /**
   * The news pass, on a third guard — see the header.
   *
   * It writes to `players.status`, which the draft pool renders, so a failure
   * here is louder than it looks: no news is indistinguishable from no
   * injuries. Every failed pass is therefore logged, as the stats pass's are.
   */
  let newsInFlight: Promise<void> | null = null;
  let newsFailures = 0;

  async function newsPass(): Promise<void> {
    try {
      await ensureAuth(pb, env);
      const report = await ingestNews({ pb, log });
      if (
        report.created > 0 ||
        report.updated > 0 ||
        report.flagged > 0 ||
        report.problems.length > 0
      ) {
        log(summariseNews(report));
        for (const problem of report.problems.slice(0, 10)) {
          log(`news · ${problem}`, "warn");
        }
      }
      if (newsFailures > 0) {
        log(`news recovered after ${newsFailures} failed pass(es)`);
        newsFailures = 0;
      }
    } catch (error) {
      newsFailures += 1;
      log(
        `news pass failed (${newsFailures} in a row): ${describeError(error)}`,
        "error",
      );
      pb.authStore.clear();
    }
  }

  function scheduleNews(): void {
    if (env.NEWS_FETCH === "off") {
      log("news fetch is off (NEWS_FETCH=off) — injuries will not import");
      return;
    }
    log(`news fetch on · every ${NEWS_EVERY_MS / 60_000}min`);
    const run = () => {
      if (stopping || newsInFlight) return;
      newsInFlight = newsPass().finally(() => {
        newsInFlight = null;
      });
    };
    setTimeout(() => {
      run();
      newsTimer = setInterval(run, NEWS_EVERY_MS);
    }, NEWS_FIRST_AFTER_MS).unref?.();
  }

  let statsTimer: ReturnType<typeof setInterval> | null = null;
  let newsTimer: ReturnType<typeof setInterval> | null = null;
  /**
   * Last season's averages, once, when the pool has none.
   *
   * This is **the number a draft is decided on**: a draft happens before the
   * season it drafts for has a single game in it, so `averagePirOf` falls back
   * to `prev_season_*` for every player on draft night. Until it is there the
   * pool shows dashes and autodraft falls all the way through to its
   * alphabetical tiebreak.
   *
   * It was a one-off script (`npm run stats:prev`) and therefore a thing to
   * forget. It *was* forgotten — on a local database and on production, where
   * 324 players had no last-season PIR at all until somebody went looking. A
   * pre-draft step that nothing enforces is a pre-draft step that does not
   * happen.
   *
   * So the worker does it, on the same reasoning 4.3 uses for box scores: the
   * work is idempotent, so the honest design is to let the process notice what
   * is outstanding rather than to ask a human to remember. The guard is the
   * pool itself — if any player already has a last-season average, this does
   * nothing and makes no request, so a restart costs the feed nothing.
   *
   * Once per boot, deliberately: a pool that legitimately has no last season
   * (a brand-new competition, or a feed that has not published yet) must not
   * be retried every fifteen minutes forever.
   */
  async function previousSeasonOnce(): Promise<void> {
    if (env.STATS_FETCH === "off") return;
    try {
      await ensureAuth(pb, env);
      const existing = await pb.collection("players").getList(1, 1, {
        filter: "prev_season_games > 0",
        fields: "id",
        requestKey: null,
      });
      if (existing.totalItems > 0) return;

      const season = previousSeasonOf(env.EUROLEAGUE_SEASON);
      if (!season) return;
      log(`no last-season averages in the pool — importing ${season}`);
      const averages = await fetchSeasonAverages({ season });
      const result = await applyPreviousSeason(pb, season, averages);
      log(
        `previous season · ${season} · ${result.fetched} in the feed · ${result.matched} matched · ${result.updated} written`,
      );
    } catch (error) {
      // Never fatal. A draft with no averages is worse than one with them and
      // still perfectly playable — the pool shows dashes and every pick is
      // still legal. `npm run stats:prev` remains the manual path.
      log(`previous-season import failed: ${describeError(error)}`, "error");
      pb.authStore.clear();
    }
  }

  scheduleStats();
  scheduleNews();
  // After the schedulers, so a slow feed cannot delay the sweep starting.
  void previousSeasonOnce();

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
    if (statsTimer) clearInterval(statsTimer);
    if (newsTimer) clearInterval(newsTimer);
    log(`${signal} received, finishing the tick in flight`);
    // PM2 sends SIGTERM on reload and waits before escalating. A tick is a
    // handful of local queries, so this returns immediately in practice — and
    // if it does not, being killed mid-tick costs at most one repairable pick.
    await inFlight?.catch(() => {});
    // A stats pass mid-flight is abandoned rather than waited for: it can be
    // several seconds of somebody else's network, PM2 escalates SIGTERM to
    // SIGKILL, and dying mid-pass costs nothing — the games it did not reach
    // are simply still outstanding on the next one.
    log("stopped");
    process.exit(0);
  }

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}

main();
