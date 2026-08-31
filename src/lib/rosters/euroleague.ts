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

import { normalizeApiRow } from "./normalize";
import type { NormalizedPlayer } from "./types";

const BASE = "https://api-live.euroleague.net/v2/competitions/E/seasons";

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

export type SyncFetch = typeof fetch;

/**
 * One sync is 21 requests: the clubs list plus a roster per club. That is
 * enough to meet a rate limit the research file did not know about — it
 * recorded "~50 requests during this investigation, none refused", and a run of
 * repeated syncs while building this slice earned a **429 Too Many Requests**
 * somewhere past that.
 *
 * So: a gap between club requests, and a bounded retry with backoff that
 * honours `Retry-After` when the server sends one. 5xx is retried too, because
 * a gateway blip should not cost the other nineteen clubs.
 *
 * Giving up fails in the safe direction. The throw happens before any batch is
 * stored, so there is no audit record claiming an import that never ran, and
 * nothing in `players` is touched.
 */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;
/** Politeness gap between club requests: 20 × 150ms = 3s, well spent. */
const REQUEST_GAP_MS = 150;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function getJson(
  url: string,
  doFetch: SyncFetch,
  onWait?: (message: string) => void,
): Promise<unknown> {
  let lastStatus = 0;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const response = await doFetch(url, {
      headers: { accept: "application/json" },
    });
    if (response.ok) return response.json();

    lastStatus = response.status;
    if (!RETRY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(
        `${url} answered ${response.status} ${response.statusText}` +
          (response.status === 429
            ? " — the feed is rate-limiting us. Wait a few minutes and re-run; the sync is idempotent."
            : ""),
      );
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : 1000 * 2 ** (attempt - 1);
    onWait?.(
      `${response.status} from ${url} — waiting ${Math.round(waitMs / 1000)}s (retry ${attempt} of ${MAX_ATTEMPTS - 1})`,
    );
    await sleep(waitMs);
  }

  throw new Error(
    `${url} kept answering ${lastStatus} after ${MAX_ATTEMPTS} attempts.`,
  );
}

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
      await getJson(`${BASE}/${season}/clubs`, doFetch, onProgress),
    ),
  );

  const rows: NormalizedPlayer[] = [];
  const problems: string[] = [];
  let seasonName: string | null = null;

  for (const [index, club] of clubs.entries()) {
    if (index > 0) await sleep(REQUEST_GAP_MS);
    const roster = unwrap(
      rosterResponseSchema.parse(
        await getJson(
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
