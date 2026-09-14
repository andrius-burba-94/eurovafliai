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
 * - v2 for rosters. v3 answers `UnsupportedApiVersion` on *this* path — but it
 *   is the only version that serves the season statistics table, which is why
 *   `@/lib/stats/season-totals` asks v3 and this file does not. "v3 is rejected
 *   outright" was true of every path anyone had tried and false in general.
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
  // Sent all along and read by nothing until 9.1.
  height: z.number().nullish(),
  weight: z.number().nullish(),
  birthDate: z.string().nullish(),
  country: z
    .object({ code: z.string().nullish(), name: z.string().nullish() })
    .nullish(),
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

type ApiPerson = z.infer<typeof personSchema>;

/**
 * Kept as an alias rather than replaced: `SyncFetch` is this module's public
 * vocabulary and two callers (the sync script, its tests) name it.
 */
export type SyncFetch = FeedFetch;

/**
 * Politeness gap between club requests: 20 × 150ms = 3s, well spent.
 *
 * One sync is 22 requests — the clubs list, a roster per club, and the season's
 * people for their bios — which is enough to meet the rate limit this feed
 * turned out to have. The retry policy that goes with it moved to
 * `@/lib/euroleague/http` in 4.3, when the stats fetcher became its second
 * caller; the argument for it, and the 429 that earned it, are written down
 * there.
 */
const REQUEST_GAP_MS = 150;

/**
 * Every player's bio for a season, by person code — slice 9.1.
 *
 * `/{season}/people?limit=1000` answers all 837 season people in one request
 * with `height`, `weight`, `birthDate` and `country` on each. The club rosters
 * carry the same `person` object, so strictly this is redundant — but it is one
 * request, it is where the bio is guaranteed to be complete, and keeping the
 * lookup separate is what lets a failure here cost the bios and nothing else.
 *
 * **It is emphatically not a roster.** See `fetchSeasonRosters`.
 *
 * Returns an empty map rather than throwing: a sync that cannot read heights
 * must still be able to read signings.
 */
async function fetchSeasonBios(
  season: string,
  doFetch: SyncFetch,
  onProgress?: (message: string) => void,
): Promise<Map<string, ApiPerson>> {
  const bios = new Map<string, ApiPerson>();
  try {
    const people = unwrap(
      rosterResponseSchema.parse(
        await getFeedJson(
          `${BASE}/${season}/people?limit=1000`,
          doFetch,
          onProgress,
        ),
      ),
    );
    for (const row of people) {
      const code = row.person?.code?.trim();
      if (!code || bios.has(code)) continue;
      bios.set(code, row.person as ApiPerson);
    }
  } catch (error) {
    onProgress?.(
      `Could not read season bios (${(error as Error).message}); heights and birthdays will be left as they are.`,
    );
  }
  return bios;
}

/**
 * Every player on every club for a season, normalized.
 *
 * ## Why this still walks the clubs, one request each
 *
 * `/{season}/people?limit=1000` looks like it should replace the walk, and it
 * does not. **It is a registration history, not a roster**: it returns every
 * spell a person has held this season, expired ones included, so 332 rows
 * cover 309 people and 23 of them appear at both their old club and their new
 * one. Measured against the walk on 2026-09-14 it disagreed in both
 * directions — 79 (code, club) pairs the walk does not list, and missing 60
 * that it does. Filtering to `active === true` does not reconcile it either:
 * still 21 extra and 63 missing.
 *
 * That is not a shape trap that can be worked around, it is a different
 * question being answered. The walk asks each club who is on its roster now,
 * which is the question the pool is built from, and a wrong answer here is not
 * cosmetic: a player attached to their previous club gets marked `left` and
 * disappears from the draft. So the walk stays the authority and the bulk
 * endpoint contributes bios only, joined by person code.
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

  await sleep(REQUEST_GAP_MS);
  const bios = await fetchSeasonBios(season, doFetch, onProgress);

  const rows: NormalizedPlayer[] = [];
  const problems: string[] = [];
  let seasonName: string | null = null;

  for (const club of clubs) {
    await sleep(REQUEST_GAP_MS);
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
        const code = row.person?.code?.trim();
        const bio = code ? bios.get(code) : undefined;
        // The club's own row wins on every field it has; the bio lookup only
        // fills gaps. The roster is the authority on this player, and a
        // history row must not be able to overwrite it.
        rows.push(
          normalizeApiRow(
            bio ? { ...row, person: { ...bio, ...row.person } } : row,
          ),
        );
      } catch (error) {
        problems.push(
          `${club.code} · ${row.person?.name ?? "(unnamed)"}: ${(error as Error).message}`,
        );
      }
    }
  }

  return { season, seasonName, clubs: clubs.length, rows, problems };
}
