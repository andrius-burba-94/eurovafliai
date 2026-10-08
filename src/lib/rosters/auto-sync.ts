/**
 * The roster sync the worker runs by itself — every six hours, and within the
 * hour of a name nobody in the pool answers to.
 *
 * A new signing used to stay invisible until somebody ran `npm run
 * rosters:sync`: his box-score lines were refused, his news went unattached,
 * and an external fantasy sync that rostered him stopped on a question nobody
 * could answer (EuroVafliai's round 4, Cameron Payne, 8 October 2026).
 *
 * It is the script's pipeline unattended, so it keeps every D8 safeguard and
 * adds the ones nobody is watching for: `runRosterImport` honours the authority
 * switch and `manual_lock` and quarantines suspected renames for the mapping
 * page; a departure share that looks like a truncated feed writes nothing; and
 * an unchanged roster stores no batch, so four passes a day do not bury the
 * ones that mattered.
 *
 * Framework-free, so the worker can import it.
 *
 * ## Failure recovery
 *
 * The import's own story holds (batch first, players, verdict last; re-running
 * is the repair). The follow-ups after it are each idempotent and each is
 * retried by the next pass that finds the same work: a code that now has a
 * player is re-imported until its lines exist, a news slug is attached by
 * whichever pass sees it first, and a re-queued external sync coalesces on its
 * own unique active-job key.
 */
import type PocketBase from "pocketbase";

import { queueBasketNewsSync } from "@/lib/basketnews/repository";
import { describeError } from "@/lib/drafts/pipeline";
import { decideSync, runFantasySync, syncDueLineups } from "@/lib/fantasy/store";
import {
  codesWorthChasing,
  newsWorthChasing,
  pendingCodes,
  pendingNewsNames,
  type CodeBatch,
  type NewsItemRow,
  type PoolPlayerRow,
} from "@/lib/mapping/queue";
import { matchPlayer } from "@/lib/news/items";
import { attachSlug, readNewsPlayers } from "@/lib/news/store";
import { ingestFinishedGames } from "@/lib/stats/ingest";

import { readCurrentPlayers, runRosterImport } from "./apply";
import { assessDepartures, diffRosters } from "./diff";
import { fetchSeasonRosters } from "./euroleague";

/** Four times a day: signings land between game nights, not by the minute. */
export const ROSTER_SYNC_EVERY_MS = 6 * 60 * 60_000;
/** A new unknown name may pull a pass forward, but no closer than this to the last. */
export const ROSTER_SYNC_MIN_GAP_MS = 60 * 60_000;
/** External sync questions older than this are history, not news. */
const QUESTION_FRESH_MS = 24 * 60 * 60_000;

export type RosterSyncDecision = { readonly due: false } | { readonly due: true; readonly reason: string };

/**
 * Is a pass due? Pure. The schedule, or a name nobody has seen before since
 * the last pass. A name that stays unknown after a pass (somebody the feed
 * does not list either) is not new next time, so it cannot keep the feed busy.
 */
export function rosterSyncDue(input: {
  readonly now: number;
  readonly lastRunAt: number | null;
  readonly unknown: readonly string[];
  readonly seen: ReadonlySet<string>;
}): RosterSyncDecision {
  if (input.lastRunAt === null) return { due: true, reason: "first pass since start" };
  const since = input.now - input.lastRunAt;
  if (since >= ROSTER_SYNC_EVERY_MS) return { due: true, reason: "scheduled" };
  const fresh = input.unknown.filter((key) => !input.seen.has(key));
  if (fresh.length > 0 && since >= ROSTER_SYNC_MIN_GAP_MS) {
    return { due: true, reason: `${fresh.length} new unknown name(s): ${fresh.slice(0, 3).join(", ")}` };
  }
  return { due: false };
}

async function readCodeBatches(pb: PocketBase): Promise<CodeBatch[]> {
  const page = await pb.collection("stat_imports").getList<CodeBatch>(1, 20, { sort: "-created", requestKey: null });
  return page.items;
}

async function readPool(pb: PocketBase): Promise<PoolPlayerRow[]> {
  return pb.collection("players").getFullList<PoolPlayerRow>({ fields: "id,name,name_normalized,club_code,person_code", requestKey: null });
}

async function readUnattachedNews(pb: PocketBase): Promise<NewsItemRow[]> {
  return pb.collection("player_news").getFullList<NewsItemRow>({
    filter: "player = ''",
    fields: "id,slug,name,club_name,headline,published,player,url",
    requestKey: null,
  });
}

/**
 * Every name the app is waiting on right now, as stable keys: this season's
 * box-score codes, recent news names, and the player questions a recent
 * external sync stopped on (both rulesets).
 */
export async function readUnknownNames(pb: PocketBase, season: string, now: Date): Promise<string[]> {
  const [batches, pool, news, blocked] = await Promise.all([
    readCodeBatches(pb),
    readPool(pb),
    readUnattachedNews(pb),
    pb.collection("fantasy_syncs").getFullList<{ league: string; created: string; questions?: unknown }>({
      filter: "status = 'blocked'",
      fields: "league,created,questions",
      requestKey: null,
    }),
  ]);
  const codes = codesWorthChasing(pendingCodes(batches, pool), season).map((code) => `code:${code.personCode}`);
  const names = newsWorthChasing(pendingNewsNames(news), now).map((name) => `news:${name.slug}`);
  const questions = blocked
    .filter((run) => now.getTime() - Date.parse(run.created.replace(" ", "T")) <= QUESTION_FRESH_MS)
    .flatMap((run) =>
      (Array.isArray(run.questions) ? run.questions : []).flatMap((question: { kind?: string; fantasyPlayerId?: string; name?: string }) =>
        question.kind === "player" ? [`player:${question.fantasyPlayerId ?? question.name ?? "?"}`] : [],
      ),
    );
  return [...new Set([...codes, ...names, ...questions])];
}

export type RosterSyncReport = {
  /** Why nothing was imported, when nothing was. */
  readonly skipped: string | null;
  readonly batchId: string | null;
  readonly applied: boolean;
  readonly added: readonly string[];
  readonly codesFilled: number;
  readonly renamesHeld: number;
  readonly reimportedLines: number;
  readonly newsAttached: number;
  readonly requeued: readonly string[];
  readonly problems: readonly string[];
};

const NOTHING = {
  batchId: null,
  applied: false,
  added: [],
  codesFilled: 0,
  renamesHeld: 0,
  reimportedLines: 0,
  newsAttached: 0,
  requeued: [],
  problems: [],
} as const;

export async function syncRostersFromFeed(options: {
  readonly pb: PocketBase;
  readonly season: string;
  readonly now: Date;
  readonly doFetch?: typeof fetch;
  readonly log?: (message: string) => void;
  /**
   * How to re-read the games a newly known code appeared in, or `false` when
   * box-score fetching is off (re-importing also rewrites the schedule).
   * Returns the lines it created.
   */
  readonly reimport?: false | ((games: readonly number[]) => Promise<number>);
  /** Set to re-run a blocked Fantasy Challenge sync once its player exists. */
  readonly fantasyToken?: string;
}): Promise<RosterSyncReport> {
  const { pb, season, now } = options;
  const { rows, problems } = await fetchSeasonRosters({ season, doFetch: options.doFetch, onProgress: options.log });
  if (rows.length === 0) return { ...NOTHING, skipped: "the feed returned no players", problems };

  const current = await readCurrentPlayers(pb);
  const diff = diffRosters({ current, incoming: rows });
  const departures = assessDepartures(diff, current.length);
  if (departures.alarming) {
    return {
      ...NOTHING,
      skipped: `refused: it would mark ${departures.count} of ${current.length} players as left, which is what a truncated feed looks like. Run npm run rosters:sync by hand if it is real.`,
      problems,
    };
  }
  if (diff.adds.length + diff.changes.length + diff.leaving.length + diff.renames.length === 0) {
    return { ...NOTHING, skipped: "unchanged", problems };
  }

  const waiting = codesWorthChasing(pendingCodes(await readCodeBatches(pb), await readPool(pb)), season);
  const outcome = await runRosterImport({ pb, incoming: rows, source: "api", season, problems });
  const report = {
    ...NOTHING,
    skipped: null,
    batchId: outcome.batchId,
    applied: outcome.applied,
    added: outcome.applied ? outcome.diff.adds.map((row) => row.name) : [],
    codesFilled: outcome.applied ? outcome.diff.changes.filter((change) => "person_code" in change.fields).length : 0,
    renamesHeld: outcome.diff.renames.length,
    problems: [...outcome.failures, ...outcome.diff.problems],
  };
  if (!outcome.applied || report.added.length + report.codesFilled === 0) return report;

  const followUps: string[] = [];
  let reimportedLines = 0;
  let newsAttached = 0;
  const requeued: string[] = [];

  // Box-score lines refused before their player existed.
  const pool = await readPool(pb);
  const known = new Set(pool.map((player) => player.person_code).filter(Boolean));
  const games = [...new Set(waiting.filter((code) => known.has(code.personCode)).flatMap((code) => code.games))];
  if (games.length > 0 && options.reimport !== false) {
    const reimport =
      options.reimport ??
      (async (onlyGames: readonly number[]) =>
        (await ingestFinishedGames({ pb, season, onlyGames, maxGames: onlyGames.length, doFetch: options.doFetch })).created);
    try {
      reimportedLines = await reimport(games);
    } catch (error) {
      followUps.push(`re-importing games ${games.join(", ")} failed: ${describeError(error)}`);
    }
  }

  // News names that now resolve to exactly one player.
  try {
    const players = await readNewsPlayers(pb);
    for (const name of newsWorthChasing(pendingNewsNames(await readUnattachedNews(pb)), now)) {
      const match = matchPlayer({ slug: name.slug, name: name.name }, players, new Map());
      if (match.matched) newsAttached += await attachSlug(pb, name.slug, match.playerId);
    }
  } catch (error) {
    followUps.push(`attaching news failed: ${describeError(error)}`);
  }

  // External syncs that stopped on a player who may now exist, in both rulesets.
  try {
    const leagues = await pb.collection("leagues").getFullList<{ id: string; basketnews_team_id?: string; fantasy_league_id?: string }>({
      filter: "status = 'season'",
      fields: "id,basketnews_team_id,fantasy_league_id",
      requestKey: null,
    });
    for (const league of leagues) {
      if (league.basketnews_team_id) {
        await queueBasketNewsSync(pb, league.id, now);
        requeued.push(league.id);
      } else if (league.fantasy_league_id && options.fantasyToken) {
        const [latest] = (
          await pb.collection("fantasy_syncs").getList<{ status: string }>(1, 1, { filter: `league = '${league.id}'`, sort: "-ran_at", requestKey: null })
        ).items;
        if (latest?.status !== "blocked") continue;
        const decision = await decideSync(pb, season, now);
        await runFantasySync({ pb, leagueId: league.id, token: options.fantasyToken, season, decision, now, doFetch: options.doFetch });
        await syncDueLineups({ pb, leagueId: league.id, token: options.fantasyToken, season, now: new Date(), force: true, doFetch: options.doFetch });
        requeued.push(league.id);
      }
    }
  } catch (error) {
    followUps.push(`re-running external syncs failed: ${describeError(error)}`);
  }

  return { ...report, reimportedLines, newsAttached, requeued, problems: [...report.problems, ...followUps] };
}

/**
 * One worker log line; a pass that changed nothing says nothing, even when the
 * feed carries the same unreadable rows it carried six hours ago.
 */
export function summariseRosterSync(report: RosterSyncReport): string | null {
  if (report.skipped === "unchanged") return null;
  if (report.skipped) return `rosters · ${report.skipped}`;
  const parts = [
    report.applied ? "applied" : "report-only (the CSV holds authority)",
    report.added.length ? `+${report.added.length} (${report.added.slice(0, 5).join("; ")})` : null,
    report.codesFilled ? `${report.codesFilled} code(s) filled` : null,
    report.renamesHeld ? `${report.renamesHeld} suspected rename(s) for /players/mapping` : null,
    report.reimportedLines ? `${report.reimportedLines} box-score line(s) recovered` : null,
    report.newsAttached ? `${report.newsAttached} news item(s) attached` : null,
    report.requeued.length ? `${report.requeued.length} external sync(s) re-run` : null,
    report.problems.length ? `${report.problems.length} problem(s)` : null,
  ].filter(Boolean);
  return `rosters · batch ${report.batchId} · ${parts.join(" · ")}`;
}
