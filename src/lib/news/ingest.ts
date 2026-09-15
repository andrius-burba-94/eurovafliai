/**
 * One news pass — slice 9.4.
 *
 * Framework-free, like the stats pass it is modelled on: the worker runs it on
 * its own in-flight guard, and `npm run news:sync` runs the same function, so
 * "what the worker does" is never a second implementation of "what I can do by
 * hand".
 *
 * A pass is cheap and stateless: two HTML requests, one plan, and writes only
 * where something changed. Most passes store nothing at all — the pages carry
 * the latest 25 items and they do not move every hour.
 */

import type PocketBase from "pocketbase";

import type { FeedFetch } from "@/lib/euroleague/http";

import { describeNewsPlan, planNewsImport, type NewsPlan } from "./items";
import {
  applyNewsPlan,
  readNewsPlayers,
  readStoredNews,
  type AppliedNews,
} from "./store";
import { fetchRotowireNews } from "./rotowire";

export type NewsReport = {
  /** Items the pages carried, after both views were deduplicated. */
  readonly read: number;
  readonly created: number;
  readonly updated: number;
  readonly unchanged: number;
  /** Players whose status this pass changed. */
  readonly flagged: number;
  /** Published names the pool could not resolve — 4.2's queue. */
  readonly unmatched: number;
  readonly problems: string[];
};

/** A one-line summary for the worker log. A pass that did nothing says nothing. */
export function summariseNews(report: NewsReport): string {
  const parts = [
    `${report.read} item(s)`,
    `${report.created} new`,
  ];
  if (report.updated) parts.push(`${report.updated} updated`);
  if (report.flagged) parts.push(`${report.flagged} flagged`);
  if (report.unmatched) parts.push(`${report.unmatched} unmatched name(s)`);
  if (report.problems.length) parts.push(`${report.problems.length} problem(s)`);
  return `news · ${parts.join(", ")}`;
}

export async function ingestNews({
  pb,
  doFetch = fetch,
  log,
  now = () => new Date(),
}: {
  pb: PocketBase;
  doFetch?: FeedFetch;
  log?: (message: string) => void;
  now?: () => Date;
}): Promise<NewsReport> {
  const { items, problems } = await fetchRotowireNews({
    doFetch,
    onProgress: log,
  });

  if (items.length === 0) {
    // Nothing readable. Both views being unreadable at once is the shape of a
    // markup change or an outage, and either way there is nothing to store.
    return {
      read: 0,
      created: 0,
      updated: 0,
      unchanged: 0,
      flagged: 0,
      unmatched: 0,
      problems,
    };
  }

  const [stored, players] = await Promise.all([
    readStoredNews(pb),
    readNewsPlayers(pb),
  ]);

  const plan: NewsPlan = planNewsImport({
    scraped: items,
    stored,
    players,
    now: now(),
  });

  const applied: AppliedNews = await applyNewsPlan(pb, plan);

  // Every flag is logged by name. A player quietly becoming unavailable on the
  // eve of a draft is exactly the event somebody should be able to find later.
  for (const change of plan.statusChanges) {
    log?.(`news · ${change.playerName} marked ${change.to} — ${change.headline}`);
  }
  for (const name of plan.unmatched) {
    log?.(
      `news · "${name.name}" (${name.clubName || "no club"}) matches ${
        name.reason === "nobody" ? "nobody" : "more than one player"
      } in the pool — waiting in player mapping.`,
    );
  }
  log?.(describeNewsPlan(plan));

  return {
    read: items.length,
    created: applied.created,
    updated: applied.updated,
    unchanged: applied.unchanged,
    flagged: applied.flagged,
    unmatched: plan.unmatched.length,
    problems: [...problems, ...applied.failures],
  };
}
