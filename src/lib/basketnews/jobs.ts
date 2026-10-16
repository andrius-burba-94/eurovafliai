import type PocketBase from "pocketbase";

import { describeError } from "@/lib/drafts/pipeline";
import { basketNewsDue, roundWindows } from "@/lib/fantasy/windows";
import { readStoredFixtures } from "@/lib/fixtures/store";

import { basketNewsLeagueIds, markBasketNewsJob, PocketBaseBasketNewsRepository, queueBasketNewsSync, queuedBasketNewsJobs } from "./repository";
import { basketNewsSource, syncBasketNews, type BasketNewsSource } from "./sync";

/** A worker pass; running jobs are retried from their saved round after a restart. */
export async function processBasketNewsJobs(
  pb: PocketBase,
  cookie: string | undefined,
  source: BasketNewsSource = basketNewsSource,
  warn: (message: string) => void = () => {},
  now: () => Date = () => new Date(),
): Promise<number> {
  const jobs = await queuedBasketNewsJobs(pb);
  const repository = new PocketBaseBasketNewsRepository(pb);
  for (const job of jobs) {
    await markBasketNewsJob(pb, job.id, { status: "running", message: "Reading BasketNews." });
    try {
      if (!cookie) throw new Error("BASKETNEWS_COOKIE is missing. Add the read-only BasketNews session to the worker environment.");
      const outcome = await syncBasketNews(repository, job.league, job.id, cookie, job.job_meta?.nextRound ?? 0, source, now());
      for (const warning of outcome.warnings ?? []) warn(`BasketNews · league ${job.league} · ${warning}`);
      await markBasketNewsJob(pb, job.id, {
        status: outcome.status, message: outcome.message, questions: outcome.questions, round: outcome.rounds, active_league: "",
      });
    } catch (error) {
      await markBasketNewsJob(pb, job.id, {
        status: "failed", message: describeError(error).slice(0, 500), active_league: "",
      });
    }
  }
  return jobs.length;
}

/**
 * Queues a job for each source-owned league whose read is due on the game-day
 * clock (`basketNewsDue`): once per game day after its first tip-off, once
 * after a round settles, every six hours between rounds. Sync now queues
 * directly. A unique active-job index coalesces the two. Returns how many it
 * queued.
 */
export async function queueBasketNewsLeagues(pb: PocketBase, season: string, now: Date): Promise<number> {
  const leagueIds = await basketNewsLeagueIds(pb);
  if (leagueIds.length === 0) return 0;
  const fixtures = await readStoredFixtures(pb, season);
  const windows = roundWindows(fixtures.map((row) => ({ round: row.round, utcDate: row.utc_date || null })));
  let queued = 0;
  for (const leagueId of leagueIds) {
    const runs = await pb.collection("fantasy_syncs").getFullList<{ ran_at: string; status: string }>({
      filter: `league = '${leagueId}' && provider = 'basketnews'`, fields: "ran_at,status", requestKey: null,
    });
    const refs = runs.map((run) => ({ round: 0, ranAt: Date.parse(run.ran_at.replace(" ", "T")), status: run.status }));
    if (!basketNewsDue(now.getTime(), windows, refs)) continue;
    await queueBasketNewsSync(pb, leagueId, now);
    queued += 1;
  }
  return queued;
}
