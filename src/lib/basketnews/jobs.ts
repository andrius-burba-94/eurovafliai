import type PocketBase from "pocketbase";

import { describeError } from "@/lib/drafts/pipeline";

import { basketNewsLeagueIds, markBasketNewsJob, PocketBaseBasketNewsRepository, queueBasketNewsSync, queuedBasketNewsJobs } from "./repository";
import { basketNewsSource, syncBasketNews, type BasketNewsSource } from "./sync";

/** A worker pass; running jobs are retried from their saved round after a restart. */
export async function processBasketNewsJobs(pb: PocketBase, cookie: string | undefined, source: BasketNewsSource = basketNewsSource): Promise<number> {
  const jobs = await queuedBasketNewsJobs(pb);
  const repository = new PocketBaseBasketNewsRepository(pb);
  for (const job of jobs) {
    await markBasketNewsJob(pb, job.id, { status: "running", message: "Reading BasketNews." });
    try {
      if (!cookie) throw new Error("BASKETNEWS_COOKIE is missing. Add the read-only BasketNews session to the worker environment.");
      const outcome = await syncBasketNews(repository, job.league, job.id, cookie, job.job_meta?.nextRound ?? 0, source);
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

/** Only source-owned leagues are scheduled; a unique active-job index coalesces passes. */
export async function queueBasketNewsLeagues(pb: PocketBase, now: Date): Promise<number> {
  const leagueIds = await basketNewsLeagueIds(pb);
  for (const leagueId of leagueIds) await queueBasketNewsSync(pb, leagueId, now);
  return leagueIds.length;
}
