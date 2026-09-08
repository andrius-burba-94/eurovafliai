/**
 * One way of talking to the Euroleague feed, shared by both things that do.
 *
 * Extracted from `src/lib/rosters/euroleague.ts` in 4.3, when the stats
 * fetcher became the second caller. There is one rate limit, one retry policy
 * and one set of statuses worth retrying, and having them written twice would
 * mean the roster sync and the stats fetcher could disagree about how to be a
 * good citizen of somebody else's API.
 *
 * Framework-free and `doFetch`-injectable, so both callers stay testable
 * without a network — and so the worker can import this without dragging in
 * anything from Next.
 *
 * ## Why there is a limit at all
 *
 * `docs/research/euroleague-api.md` originally recorded "~50 requests during
 * this investigation, none refused" and read that as no limit. There is one:
 * building 2.1 meant repeating a 21-request sync, and somewhere past ~100
 * requests in a few minutes the feed started answering **429** on the very
 * first call. It clears on its own after a few minutes. So every caller spaces
 * its requests and retries a 429 with backoff, honouring `Retry-After`.
 *
 * ## Why the deliberate absence of a dependency
 *
 * The blueprint names the `euroleague-api` TS SDK for 4.3, and it was
 * evaluated rather than dismissed: it is alive (1.2.1, published 2026-08-04,
 * MIT, Node ≥20), depends on `zod@^4` as we do, and its
 * `boxscore.getGameStats` returns byte-for-byte the shape our golden fixture
 * already validates. It was still not adopted, for one reason that matters to
 * an *unattended* job: its schemas validate the whole payload, so a feed
 * change to a field we never read can refuse a whole round, and the automation
 * stops. A schema over only the ten fields we do read keeps importing through
 * that. The trade is real in both directions — we give up somebody else's
 * maintained schemas — and it is recorded here rather than left as a mystery.
 */

export type FeedFetch = typeof fetch;

/** Statuses worth a second attempt. Everything else will not fix itself. */
const RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 4;

export const FEED_BASE =
  "https://api-live.euroleague.net/v2/competitions/E/seasons";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET one JSON document, retrying the statuses that can pass.
 *
 * Giving up throws, and throwing is the safe direction for both callers: the
 * roster sync throws before any batch is stored, and the stats fetcher throws
 * before a game's rows are planned, so neither leaves an audit record claiming
 * an import that never ran.
 */
export async function getFeedJson(
  url: string,
  doFetch: FeedFetch = fetch,
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
            ? " — the feed is rate-limiting us. Wait a few minutes and re-run; both importers are idempotent."
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
