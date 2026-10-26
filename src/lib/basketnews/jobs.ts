import type PocketBase from "pocketbase";

import { describeError } from "@/lib/drafts/pipeline";
import { readRunRefs, readWindows } from "@/lib/fantasy/store";
import { basketNewsDue } from "@/lib/fantasy/windows";
import { asPbDate } from "@/lib/memberships/store";

import { basketNewsLeagueIds, markBasketNewsJob, PocketBaseBasketNewsRepository, queueBasketNewsSync, queuedBasketNewsJobs } from "./repository";
import { basketNewsSource, syncBasketNews, type BasketNewsSource } from "./sync";
import { completeSourcePlayerRecovery } from "./registrations";

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
      const outcome = await syncBasketNews(repository, job.league, job.id, cookie, job.job_meta?.nextRound ?? 0, source, now());
      for (const warning of outcome.warnings ?? []) warn(`BasketNews · league ${job.league} · ${warning}`);
      await markBasketNewsJob(pb, job.id, {
        status: outcome.status, message: outcome.message, questions: outcome.questions, round: outcome.rounds, active_league: "", diagnostics: outcome.warnings ?? [],
      });
      if (outcome.status === "applied") {
        const league = await pb.collection("leagues").getOne<{ season: string }>(job.league, { fields: "season", requestKey: null });
        await completeSourcePlayerRecovery(pb, `E${league.season.slice(0, 4)}`, job.league);
      }
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
  const windows = await readWindows(pb, season);
  // A job counts for every round, so nothing before the latest settled round
  // can change the answer: that round is due unless a job has run since.
  const settled = windows.filter((window) => window.settledAt <= now.getTime()).map((window) => window.settledAt);
  const since = settled.length ? ` && ran_at >= '${asPbDate(new Date(Math.max(...settled)))}'` : "";
  let queued = 0;
  for (const leagueId of leagueIds) {
    const refs = await readRunRefs(pb, `league = '${leagueId}' && provider = 'basketnews'${since}`);
    if (!basketNewsDue(now.getTime(), windows, refs)) continue;
    await queueBasketNewsSync(pb, leagueId, now);
    queued += 1;
  }
  return queued;
}
