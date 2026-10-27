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
 * **9.4 added the news pass**, hourly, on its own guard for the same reason —
 * it reads two of somebody else's web pages, which is the slowest and least
 * predictable thing this process does, and neither a pick deadline nor a box
 * score may queue behind it. Every later pass follows the same rule through
 * `./passes.ts`: one guard each, one shared superuser session.
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "@/lib/config/schema";
import type { FixtureRecord } from "@/lib/fixtures/store";
import { fetchLiveBoxscore } from "@/lib/live/boxscore";
import { inLiveWindow, liveWindowFilter } from "@/lib/live/status";
import { upsertLiveSnapshot } from "@/lib/live/store";

import { describeError } from "@/lib/drafts/pipeline";
import { processBasketNewsJobs, queueBasketNewsLeagues } from "@/lib/basketnews/jobs";
import { readBasketNewsPlayerPool, readBasketNewsTeamReference } from "@/lib/basketnews/client";
import { basketNewsSource } from "@/lib/basketnews/sync";
import { fetchPlayerPool } from "@/lib/fantasy/client";
import { syncDueLeagues, syncDueLineups } from "@/lib/fantasy/store";
import { readDuePositions, type PositionsReport } from "@/lib/source-positions/store";
import { refreshOutlooks } from "@/lib/advisor/store";

import { ingestNews, summariseNews } from "@/lib/news/ingest";
import {
  readUnknownNames,
  ROSTER_SYNC_EVERY_MS,
  rosterSyncDue,
  summariseRosterSync,
  syncRostersFromFeed,
} from "@/lib/rosters/auto-sync";
import { fetchSeasonAverages } from "@/lib/stats/euroleague";
import { ingestFinishedGames, summariseIngest } from "@/lib/stats/ingest";
import { ensureSlugs } from "@/lib/slugs/store";
import { previousSeasonOf } from "@/lib/stats/seasons";
import { applyPreviousSeason } from "@/lib/stats/store";

import { buildBriefFacts } from "@/lib/ai/brief-facts";
import { readBriefFactsInput } from "@/lib/ai/brief-facts-store";
import { readCompleteRounds, readRoundFactsInput } from "@/lib/ai/round-facts-store";
import { buildRoundFacts } from "@/lib/ai/round-facts";
import type { PassReport, RoundPassDeps } from "@/lib/ai/round-pass";
import { readScoutFactsInput } from "@/lib/ai/scout-facts-store";
import { runRequestedRewrites, runWriteupPass } from "@/lib/ai/writeup-pass";

import { createPasses, superuserSession, type PassLock } from "./passes";
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
 * How long shutdown waits for passes in flight. Under the worker's PM2
 * `kill_timeout`, so the process exits on its own before SIGKILL; a pass cut
 * off here is idempotent and the next boot finishes it.
 */
const SHUTDOWN_DEADLINE_MS = 8_000;
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
/** 7.1's write-ups: a pass a quarter-hour after the stats one, a minute's look for Rewrite. */
const AI_EVERY_MS = 15 * 60_000;
const AI_FIRST_AFTER_MS = 150_000;
const AI_REQUESTS_EVERY_MS = 60_000;
const NEWS_FIRST_AFTER_MS = 90_000;
const LIVE_EVERY_MS = 60_000;
const LIVE_FIRST_AFTER_MS = 95_000;
const FANTASY_EVERY_MS = 10 * 60_000;
const FANTASY_FIRST_AFTER_MS = 120_000;
/** How often to ask whether a BasketNews read is due; `basketNewsDue` holds it to the game-day clock. */
const BASKETNEWS_DUE_CHECK_EVERY_MS = 10 * 60_000;
/** 7.2 D: how often to ask which linked league's game is due a positions read (each is read daily). */
const POSITIONS_EVERY_MS = 15 * 60_000;
const POSITIONS_FIRST_AFTER_MS = 180_000;
/** 7.2 E: outlooks, two minutes after the first stats pass and every quarter-hour after. */
const SCOUT_EVERY_MS = 15 * 60_000;
const SCOUT_FIRST_AFTER_MS = 120_000;
/**
 * How often the roster scheduler asks whether a pass is due. The question is
 * a few local reads; the pass itself is 21 feed requests, and `rosterSyncDue`
 * holds it to every six hours or a new unknown name, never closer than an hour.
 */
const ROSTER_CHECK_EVERY_MS = 15 * 60_000;
const ROSTER_FIRST_AFTER_MS = 180_000;
/** Queued BasketNews syncs are a manager's button press; fifteen seconds is prompt enough for one. */
const BASKETNEWS_POLL_EVERY_MS = 15_000;

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

/** Round write-ups, briefs and scout reasons all report the same four counts. */
function logWriteReport(
  label: string,
  report: { written: number; rewritten: number; refused: number; guarded: number; stopped: string | null },
): void {
  const parts = [
    report.written ? `${report.written} written` : "",
    report.rewritten ? `${report.rewritten} rewritten` : "",
    report.refused ? `${report.refused} refused by the guard` : "",
    report.guarded ? `${report.guarded} re-guarded` : "",
  ].filter(Boolean);
  if (parts.length > 0) log(`${label} · ${parts.join(", ")}`);
  if (report.stopped) log(`${label} stopped early: ${report.stopped}`, "warn");
}

function main(): void {
  const env = parseServerEnv(process.env);
  const pb = new PocketBase(env.PB_INTERNAL_URL);
  const auth = superuserSession(
    pb,
    () => pb.collection("_superusers").authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD),
    log,
  );
  const passes = createPasses({ log, auth });
  const season = env.EUROLEAGUE_SEASON;
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
      await auth.ensure();
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
      // A rejected token marks the session stale, so the next tick logs in
      // again; an unreachable PocketBase just fails until it is back.
      auth.noteFailure(error);
    }
  }

  /**
   * The stats pass. A pass that hangs on a slow feed response must not stop
   * pick deadlines being enforced, and a sweep must not delay a pass. The two
   * share only the PocketBase client and its auth.
   */
  passes.schedule({
    name: "stats pass",
    firstAfterMs: STATS_FIRST_AFTER_MS,
    everyMs: STATS_EVERY_MS,
    off: env.STATS_FETCH === "off" && "stats fetch is off (STATS_FETCH=off) — box scores will not import",
    on: `stats fetch on · ${season} · every ${STATS_EVERY_MS / 60_000}min`,
    // A failed pass writes no batch record: `ingestFinishedGames` throws before
    // it writes one, so nothing claims an import that never ran.
    run: async () => {
      const report = await ingestFinishedGames({ pb, season, log });
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
    },
  });

  /**
   * The news pass. It writes to `players.status`, which the draft pool
   * renders, so a failure here is louder than it looks: no news is
   * indistinguishable from no injuries.
   */
  passes.schedule({
    name: "news pass",
    firstAfterMs: NEWS_FIRST_AFTER_MS,
    everyMs: NEWS_EVERY_MS,
    off: env.NEWS_FETCH === "off" && "news fetch is off (NEWS_FETCH=off) — injuries will not import",
    on: `news fetch on · every ${NEWS_EVERY_MS / 60_000}min`,
    run: async () => {
      const report = await ingestNews({ pb, log });
      if (report.created > 0 || report.updated > 0 || report.flagged > 0 || report.problems.length > 0) {
        log(summariseNews(report));
        for (const problem of report.problems.slice(0, 10)) {
          log(`news · ${problem}`, "warn");
        }
      }
    },
  });

  // Keys already logged, `game|person` for a disagreement and `game|failed`
  // for a feed that will not answer: both persist for the rest of the game, so
  // each is said once, and a game's keys go when it leaves the window.
  const liveSeen = new Set<string>();
  passes.schedule({
    name: "live pass",
    firstAfterMs: LIVE_FIRST_AFTER_MS,
    everyMs: LIVE_EVERY_MS,
    off: env.LIVE_FETCH === "off" && "live box-score polling is off (LIVE_FETCH=off)",
    run: async () => {
      const now = Date.now();
      const nearby = await pb.collection("fixtures").getFullList<FixtureRecord>({
        filter: liveWindowFilter(season, now),
        requestKey: null,
      });
      const candidates = nearby.filter((fixture) => inLiveWindow(fixture.utc_date, now));
      const open = new Set(candidates.map((fixture) => String(fixture.game_code)));
      for (const key of liveSeen) if (!open.has(key.split("|")[0])) liveSeen.delete(key);
      if (candidates.length === 0) return;
      const finished = await pb.collection("live_game_snapshots").getFullList<{ game_code: number }>({
        filter: `season = '${season}' && live = false && (${candidates.map((fixture) => `game_code = ${fixture.game_code}`).join(" || ")})`,
        fields: "game_code",
        requestKey: null,
      });
      const done = new Set(finished.map((row) => row.game_code));
      for (const fixture of candidates) {
        if (done.has(fixture.game_code)) continue;
        const failed = `${fixture.game_code}|failed`;
        try {
          const parsed = await fetchLiveBoxscore(fixture.game_code, season, fixture.local_club, fixture.road_club);
          if (!parsed) continue;
          const { game } = parsed;
          for (const problem of parsed.problems) {
            const key = `${fixture.game_code}|${problem.personCode}`;
            if (liveSeen.has(key)) continue;
            liveSeen.add(key);
            log(`live · game ${fixture.game_code} · ${problem.message}`, "warn");
          }
          const outcome = await upsertLiveSnapshot(pb, {
            season,
            gameCode: fixture.game_code,
            round: fixture.round,
            checkedAt: new Date().toISOString(),
            game,
          });
          if (liveSeen.delete(failed)) log(`live · game ${fixture.game_code} recovered`);
          if (outcome !== "unchanged") log(`live · game ${fixture.game_code} · ${outcome} · ${game.live ? "provisional" : "finished"}`);
        } catch (error) {
          if (!liveSeen.has(failed)) log(`live · game ${fixture.game_code} failed: ${describeError(error)}`, "warn");
          liveSeen.add(failed);
          auth.noteFailure(error);
        }
      }
    },
  });

  /**
   * The Fantasy Challenge roster sync: somebody else's API, and a pick
   * deadline must never wait on it. Every ten minutes it asks whether a pass
   * is due — `syncDueLeagues` holds the schedule (once per game day inside a
   * round's freeze, a preview every six hours outside it) — so a pass lands
   * within ten minutes of the five-minutes-after-tip-off mark. Lineups follow
   * the rosters in the same pass, so a frozen round's lineups are checked
   * against the roster that was just synced; `syncDueLineups` holds their
   * schedule (`lineupRoundsDue`).
   */
  const fantasyToken = env.FANTASY_CHALLENGE_TOKEN ?? "";
  passes.schedule({
    name: "fantasy sync pass",
    firstAfterMs: FANTASY_FIRST_AFTER_MS,
    everyMs: FANTASY_EVERY_MS,
    off: !fantasyToken && "fantasy roster and lineup sync is off (no FANTASY_CHALLENGE_TOKEN)",
    on: `fantasy roster and lineup sync on · checks every ${FANTASY_EVERY_MS / 60_000}min`,
    run: async () => {
      const rosters = await syncDueLeagues({ pb, token: fantasyToken, season, now: new Date() });
      const lineups = await syncDueLineups({ pb, token: fantasyToken, season, now: new Date() });
      for (const result of [...rosters, ...lineups]) {
        if (result.error) {
          log(`fantasy sync · league ${result.leagueId} failed: ${result.error}`, "error");
        } else if (result.run) {
          const { kind, mode, round, status, message } = result.run;
          log(`fantasy sync · league ${result.leagueId} · ${kind} · ${mode} round ${round} · ${status} · ${message}`, status === "failed" ? "warn" : "info");
        }
      }
    },
  });

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
   * be retried every fifteen minutes forever. A failure is never fatal: a
   * draft with no averages is still perfectly playable, and
   * `npm run stats:prev` remains the manual path.
   */
  if (env.STATS_FETCH !== "off") {
    passes.schedule({
      name: "previous-season import",
      firstAfterMs: 0,
      everyMs: 0,
      run: async () => {
        const existing = await pb.collection("players").getList(1, 1, {
          filter: "prev_season_games > 0",
          fields: "id",
          requestKey: null,
        });
        if (existing.totalItems > 0) return;

        const previous = previousSeasonOf(season);
        if (!previous) return;
        log(`no last-season averages in the pool — importing ${previous}`);
        const averages = await fetchSeasonAverages({ season: previous });
        const result = await applyPreviousSeason(pb, previous, averages);
        log(
          `previous season · ${previous} · ${result.fetched} in the feed · ${result.matched} matched · ${result.updated} written`,
        );
      },
    });
  }

  /**
   * Readable addresses (S28): any league, team or player without a slug gets
   * one. A row is created by many paths (roster syncs, imports, a repair), and
   * until this reaches it its links use its id, which still resolves. Local
   * reads and single-field writes, so once at boot and hourly is plenty.
   */
  passes.schedule({
    name: "slug pass",
    firstAfterMs: 5_000,
    everyMs: 60 * 60_000,
    run: async () => {
      const report = await ensureSlugs(pb);
      if (report.leagues + report.teams + report.players + report.failed > 0) {
        log(`slugs · ${report.leagues} league(s) · ${report.teams} team(s) · ${report.players} player(s) · ${report.failed} refused`);
      }
    },
  });

  /**
   * The roster sync (8 October 2026): every six hours, and within the hour of
   * a name the app is waiting on — a box-score code, a news name, or an
   * external sync's player question. Names that stay unknown after a pass are
   * remembered, so a player the feed does not list either cannot keep the
   * feed busy.
   */
  let rostersLastRunAt: number | null = null;
  const rosterNamesSeen = new Set<string>();
  passes.schedule({
    name: "roster pass",
    firstAfterMs: ROSTER_FIRST_AFTER_MS,
    everyMs: ROSTER_CHECK_EVERY_MS,
    off: env.ROSTER_FETCH === "off" && "roster sync is off (ROSTER_FETCH=off) — new signings wait for npm run rosters:sync",
    on: `roster sync on · every ${ROSTER_SYNC_EVERY_MS / 3_600_000}h, or within the hour of a new unknown name`,
    run: async () => {
      const now = new Date();
      const unknown = await readUnknownNames(pb, season, now);
      const decision = rosterSyncDue({ now: now.getTime(), lastRunAt: rostersLastRunAt, unknown, seen: rosterNamesSeen });
      if (!decision.due) return;
      rostersLastRunAt = now.getTime();
      for (const key of unknown) rosterNamesSeen.add(key);
      const report = await syncRostersFromFeed({
        pb,
        season,
        now,
        ...(env.STATS_FETCH === "off" ? { reimport: false as const } : {}),
        fantasyToken: env.FANTASY_CHALLENGE_TOKEN,
      });
      const line = summariseRosterSync(report);
      if (line) log(`${line} · ${decision.reason}`, report.problems.length > 0 || report.skipped?.startsWith("refused") ? "warn" : "info");
      if (line) for (const problem of report.problems.slice(0, 10)) log(`rosters · ${problem}`, "warn");
    },
  });

  /**
   * Write-ups: 7.1 round write-ups, 7.3 B briefs, 7.2 G reasons (ADR-0012,
   * ADR-0013). Its own in-flight guard, shared by the fifteen-minute pass and
   * the one-minute Rewrite check, so the two never write the same row at
   * once — and neither waits on, or delays, a pick deadline. Nothing here is
   * fairness-critical: a dead pass means no prose, and every page renders as
   * it did without it.
   */
  const aiDeps = (): RoundPassDeps => ({
    pb,
    season,
    apiKey: env.GEMINI_API_KEY ?? "",
    model: env.GEMINI_MODEL,
    now: () => Date.now(),
    readComplete: (leagueId) => readCompleteRounds(pb, { leagueId, season, now: Date.now() }),
    readFacts: async (leagueId, round) => {
      const read = await readRoundFactsInput(pb, { leagueId, season, round, now: Date.now() });
      if (!read.ok) return null;
      const built = buildRoundFacts(read.input);
      return built.ok ? built.facts : null;
    },
  });
  const briefDeps = (deps: RoundPassDeps) => ({
    readBriefFacts: async (leagueId: string, round: number) => {
      const read = await readBriefFactsInput(pb, { leagueId, season: deps.season, round, now: deps.now() });
      if (!read.ok) return null;
      const built = buildBriefFacts(read.input);
      return built.ok ? built.facts : null;
    },
    onBriefs: (briefs: Parameters<typeof logWriteReport>[1]) => logWriteReport("briefs", briefs),
    onBriefsError: (error: unknown) => log(`briefs failed: ${describeError(error)}`, "error"),
  });
  const writeups = (label: string, run: (deps: RoundPassDeps) => Promise<PassReport>) => async () =>
    logWriteReport(`write-ups · ${label}`, await run(aiDeps()));
  if (env.GEMINI_API_KEY) {
    const aiLock: PassLock = { current: null };
    passes.schedule({
      name: "write-ups · pass",
      firstAfterMs: AI_FIRST_AFTER_MS,
      everyMs: AI_EVERY_MS,
      lock: aiLock,
      on: `write-ups on · ${env.GEMINI_MODEL} · every ${AI_EVERY_MS / 60_000}min, Rewrite checked every minute`,
      run: writeups("pass", (deps) =>
        runWriteupPass({
          ...deps,
          ...briefDeps(deps),
          readScoutInput: (leagueId) => readScoutFactsInput(pb, { leagueId, season: deps.season }),
          onScout: (scout) => logWriteReport("scout reasons", scout),
          onScoutError: (error) => log(`scout reasons failed: ${describeError(error)}`, "error"),
        }),
      ),
    });
    passes.schedule({
      name: "write-ups · rewrite",
      firstAfterMs: AI_FIRST_AFTER_MS + AI_REQUESTS_EVERY_MS,
      everyMs: AI_REQUESTS_EVERY_MS,
      lock: aiLock,
      run: writeups("rewrite", (deps) => runRequestedRewrites({ ...deps, ...briefDeps(deps) })),
    });
  } else {
    log("write-ups off · GEMINI_API_KEY is not set");
  }

  /**
   * 7.2 D: each linked league's game, read for its whole pool's positions on
   * the first pass after the league is created or linked, then daily. Without
   * a Fantasy Challenge token only BasketNews leagues are read; theirs is public.
   */
  const positionsLine = (report: PositionsReport): string =>
    report.error
      ? `positions · league ${report.leagueId} · ${report.source} · read failed: ${report.error}`
      : `positions · league ${report.leagueId} · ${report.source} · ${report.additions} added, ${report.links} linked, ${report.questions} new question(s), ${report.unlisted} unlisted, ${report.unmatched} unplaced, ${report.rosterQuestions} roster question(s) open`;
  passes.schedule({
    name: "positions pass",
    firstAfterMs: POSITIONS_FIRST_AFTER_MS,
    everyMs: POSITIONS_EVERY_MS,
    on: `positions reads on · daily per linked league${fantasyToken ? "" : " · BasketNews only (no FANTASY_CHALLENGE_TOKEN)"}`,
    run: async () => {
      const reports = await readDuePositions({
        pb,
        now: new Date(),
        readers: {
          fantasy: fantasyToken ? () => fetchPlayerPool(fantasyToken) : null,
          basketnews: async (teamId) => readBasketNewsPlayerPool((await readBasketNewsTeamReference(teamId)).leagueId),
        },
      });
      for (const report of reports) log(positionsLine(report), report.error ? "warn" : "info");
    },
  });

  /**
   * 7.2 E: every player's outlook, per ruleset a league in season plays. Its
   * own guard, not the AI lock: it needs no key and calls no model, so a
   * league without write-ups still gets its waiver wire. Local reads and
   * changed-row writes only.
   */
  passes.schedule({
    name: "outlooks pass",
    firstAfterMs: SCOUT_FIRST_AFTER_MS,
    everyMs: SCOUT_EVERY_MS,
    run: async () => {
      const report = await refreshOutlooks(pb, { season, now: new Date() });
      if (report.written + report.removed > 0) {
        log(`outlooks · ${report.rulesets.join(", ")} · ${report.written} written, ${report.removed} removed, ${report.unchanged} unchanged`);
      }
    },
  });

  let basketNewsLastQueued = 0;
  passes.schedule({
    name: "BasketNews pass",
    firstAfterMs: BASKETNEWS_POLL_EVERY_MS,
    everyMs: BASKETNEWS_POLL_EVERY_MS,
    run: async () => {
      const now = new Date();
      if (now.getTime() - basketNewsLastQueued >= BASKETNEWS_DUE_CHECK_EVERY_MS) {
        const queued = await queueBasketNewsLeagues(pb, season, now);
        if (queued) log(`BasketNews · ${queued} league(s) due a read`);
        basketNewsLastQueued = now.getTime();
      }
      const processed = await processBasketNewsJobs(pb, env.BASKETNEWS_COOKIE, basketNewsSource, (message) => log(message, "warn"));
      if (processed) log(`BasketNews · processed ${processed} queued sync(s)`);
    },
  });

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
    log(`${signal} received, finishing the work in flight`);
    // PM2 sends SIGTERM on reload and waits `kill_timeout` before SIGKILL.
    // Every pass is idempotent, so one cut off at the deadline costs nothing
    // but a retry; waiting for it just avoids a half-written pass in the log.
    const finished = await passes.drain(SHUTDOWN_DEADLINE_MS, [inFlight]);
    log(finished ? "stopped" : `stopped with work still in flight after ${SHUTDOWN_DEADLINE_MS / 1000}s`);
    process.exit(0);
  }

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => void shutdown(signal));
  }
}

main();
