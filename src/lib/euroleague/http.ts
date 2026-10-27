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
/**
 * Long enough for the slowest honest answer, short enough that a socket that
 * never answers cannot hold the worker's live pass or a server action for the
 * five minutes Node would otherwise wait.
 */
const REQUEST_TIMEOUT_MS = 15_000;
/** A `Retry-After` past this is a feed having a bad day; the next pass is the better retry. */
const MAX_WAIT_MS = 30_000;

export const FEED_BASE =
  "https://api-live.euroleague.net/v2/competitions/E/seasons";

export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * GET one document, retrying the statuses that can pass — and a connection
 * that dropped or timed out, which passes just as often as a 503.
 *
 * Returns the `Response`, so a caller decides what the body is. 9.4's news
 * scraper reads HTML from a different publisher entirely and shares this
 * rather than growing a second retry policy — there is one set of statuses
 * worth retrying and one way to be a good citizen of somebody else's server,
 * and two copies of it would drift.
 *
 * Giving up throws, and throwing is the safe direction for every caller: the
 * roster sync throws before any batch is stored, the stats fetcher throws
 * before a game's rows are planned, and the news pass counts the view as a
 * problem — so none of them leaves an audit record claiming an import that
 * never ran.
 */
export async function fetchWithRetry(
  url: string,
  {
    doFetch = fetch,
    accept = "application/json",
    onWait,
    timeoutMs = REQUEST_TIMEOUT_MS,
    pause = sleep,
  }: {
    doFetch?: FeedFetch;
    accept?: string;
    onWait?: (message: string) => void;
    timeoutMs?: number;
    pause?: (ms: number) => Promise<unknown>;
  } = {},
): Promise<Response> {
  for (let attempt = 1; ; attempt += 1) {
    let response: Response;
    try {
      // The signal also bounds reading the body, which a caller does after this returns.
      response = await doFetch(url, { headers: { accept }, signal: AbortSignal.timeout(timeoutMs) });
    } catch (error) {
      if (attempt === MAX_ATTEMPTS) {
        throw new Error(`${url} did not answer after ${MAX_ATTEMPTS} attempts: ${error instanceof Error ? error.message : String(error)}`);
      }
      await wait(1000 * 2 ** (attempt - 1), `no answer from ${url}`, attempt);
      continue;
    }
    if (response.ok) return response;

    if (!RETRY_STATUSES.has(response.status) || attempt === MAX_ATTEMPTS) {
      throw new Error(
        `${url} answered ${response.status} ${response.statusText}` +
          (response.status === 429
            ? " — the feed is rate-limiting us. Wait a few minutes and re-run; both importers are idempotent."
            : ""),
      );
    }

    const retryAfter = Number(response.headers.get("retry-after"));
    await wait(
      Number.isFinite(retryAfter) && retryAfter > 0
        ? Math.min(retryAfter * 1000, MAX_WAIT_MS)
        : 1000 * 2 ** (attempt - 1),
      `${response.status} from ${url}`,
      attempt,
    );
  }

  async function wait(ms: number, why: string, attempt: number): Promise<void> {
    onWait?.(`${why} — waiting ${Math.round(ms / 1000)}s (retry ${attempt} of ${MAX_ATTEMPTS - 1})`);
    await pause(ms);
  }
}

/** GET one JSON document, under the retry policy above. */
export async function getFeedJson(
  url: string,
  doFetch: FeedFetch = fetch,
  onWait?: (message: string) => void,
): Promise<unknown> {
  const response = await fetchWithRetry(url, { doFetch, onWait });
  return response.json();
}
