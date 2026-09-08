/**
 * The Euroleague API front door.
 *
 * I/O lives here and nowhere else in this module: `normalize.ts` and `diff.ts`
 * stay pure so the rules that prevent data loss can be tested without a network.
 * Findings this file is built on are recorded, with their `curl` lines, in
 * docs/research/euroleague-api.md — re-verify that file before trusting it, as
 * its own warning says.
 *
 * The shape traps, all confirmed by request rather than by documentation:
 *
 * - `/clubs` is **enveloped** (`{data: […]}`); a club's `/people` is a **bare
 *   array**. The two differ, and assuming either shape for both fails.
 * - v2 only. v3 is rejected outright with `UnsupportedApiVersion`.
 * - No authentication of any kind, so no secrets and no new env vars.
 * - Each roster carries the club's coach as well as its players. The filter is
 *   an **inclusion** of `type === "J"`, never an exclusion of the coach's type:
 *   the research file recorded that type as `"T"` when it is actually `"E"`, and
 *   an exclusion written from the wrong code would have drafted twenty coaches.
 */
import { z } from "zod";

import {
  FEED_BASE,
  type FeedFetch,
  getFeedJson,
  sleep,
} from "@/lib/euroleague/http";

import { normalizeApiRow } from "./normalize";
import type { NormalizedPlayer } from "./types";

const BASE = FEED_BASE;

/** Only the fields the pipeline reads; the feed sends far more. */
const personSchema = z.object({
  code: z.string().nullish(),
  name: z.string().nullish(),
  passportName: z.string().nullish(),
  passportSurname: z.string().nullish(),
});

const rosterRowSchema = z.object({
  person: personSchema.nullish(),
  type: z.string().nullish(),
  typeName: z.string().nullish(),
  positionName: z.string().nullish(),
  dorsal: z.string().nullish(),
  club: z
    .object({ code: z.string().nullish(), name: z.string().nullish() })
    .nullish(),
  season: z.object({ name: z.string().nullish() }).nullish(),
});

const clubSchema = z.object({
  code: z.string(),
  name: z.string().nullish(),
});

/** `/clubs` is enveloped. */
const clubsResponseSchema = z.union([
  z.object({ data: z.array(clubSchema) }),
  z.array(clubSchema),
]);

/** A club's `/people` is not. */
const rosterResponseSchema = z.union([
  z.array(rosterRowSchema),
  z.object({ data: z.array(rosterRowSchema) }),
]);

const unwrap = <T>(body: { data: T[] } | T[]): T[] =>
  Array.isArray(body) ? body : body.data;

/**
 * Kept as an alias rather than replaced: `SyncFetch` is this module's public
 * vocabulary and two callers (the sync script, its tests) name it.
 */
export type SyncFetch = FeedFetch;

/**
 * Politeness gap between club requests: 20 × 150ms = 3s, well spent.
 *
 * One sync is 21 requests — the clubs list plus a roster per club — which is
 * enough to meet the rate limit this feed turned out to have. The retry policy
 * that goes with it moved to `@/lib/euroleague/http` in 4.3, when the stats
 * fetcher became its second caller; the argument for it, and the 429 that
 * earned it, are written down there.
 */
const REQUEST_GAP_MS = 150;

/**
 * Every player on every club for a season, normalized.
 *
 * `doFetch` is injectable so a test can drive this without a network. The
 * clubs list is read from the feed per season and never carried over: E2026
 * differs from E2025 by one club (Monaco out, Beşiktaş in), so a hardcoded list
 * would be wrong within a season of being written.
 *
 * A row that cannot be normalized becomes a `problem` rather than an exception:
 * one malformed player should not cost the other 323. An unmapped *position*
 * still throws, because that means the feed's vocabulary changed and guessing a
 * bucket would corrupt every legality check downstream.
 */
export async function fetchSeasonRosters({
  season = "E2026",
  doFetch = fetch,
  onProgress,
}: {
  season?: string;
  doFetch?: SyncFetch;
  /** Told about retries and rate-limit waits, so a long run is not silent. */
  onProgress?: (message: string) => void;
} = {}): Promise<{
  season: string;
  seasonName: string | null;
  clubs: number;
  rows: NormalizedPlayer[];
  problems: string[];
}> {
  const clubs = unwrap(
    clubsResponseSchema.parse(
      await getFeedJson(`${BASE}/${season}/clubs`, doFetch, onProgress),
    ),
  );

  const rows: NormalizedPlayer[] = [];
  const problems: string[] = [];
  let seasonName: string | null = null;

  for (const [index, club] of clubs.entries()) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
    const roster = unwrap(
      rosterResponseSchema.parse(
        await getFeedJson(
          `${BASE}/${season}/clubs/${club.code}/people`,
          doFetch,
          onProgress,
        ),
      ),
    );

    for (const row of roster) {
      // Include players; never exclude coaches by their type code.
      if (row.type !== "J") continue;
      seasonName ??= row.season?.name ?? null;
      try {
        rows.push(normalizeApiRow(row));
      } catch (error) {
        problems.push(
          `${club.code} · ${row.person?.name ?? "(unnamed)"}: ${(error as Error).message}`,
        );
      }
    }
  }

  return { season, seasonName, clubs: clubs.length, rows, problems };
}
