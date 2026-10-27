import { describe, expect, it } from "vitest";

import { fetchWithRetry, type FeedFetch } from "./http";

const URL_ = "https://feed.test/games";
const ok = () => new Response("{}", { status: 200 });
const noPause = async () => {};

/** A fetch that answers from a script, one entry per call, and records each wait asked for. */
function scripted(steps: Array<() => Promise<Response>>) {
  let calls = 0;
  const doFetch: FeedFetch = () => steps[calls++]!();
  return { doFetch, calls: () => calls };
}

describe("fetchWithRetry", () => {
  it("retries a dropped connection like a 5xx", async () => {
    const { doFetch, calls } = scripted([
      () => Promise.reject(new TypeError("fetch failed")),
      async () => ok(),
    ]);
    const response = await fetchWithRetry(URL_, { doFetch, pause: noPause });
    expect(response.ok).toBe(true);
    expect(calls()).toBe(2);
  });

  it("gives a request that never answers up, then retries it", async () => {
    let signals = 0;
    const doFetch: FeedFetch = (_url, init) => {
      signals += init?.signal ? 1 : 0;
      if (signals > 1) return Promise.resolve(ok());
      // Never answers; only the timeout's abort ends it.
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal!.reason));
      });
    };
    const response = await fetchWithRetry(URL_, { doFetch, pause: noPause, timeoutMs: 10 });
    expect(response.ok).toBe(true);
    expect(signals).toBe(2);
  });

  it("names the URL and the cause once every attempt has failed", async () => {
    const { doFetch, calls } = scripted(Array.from({ length: 4 }, () => () => Promise.reject(new TypeError("fetch failed"))));
    await expect(fetchWithRetry(URL_, { doFetch, pause: noPause })).rejects.toThrow(/feed\.test\/games.*fetch failed/);
    expect(calls()).toBe(4);
  });

  it("caps a Retry-After the feed asks for", async () => {
    const waits: number[] = [];
    const { doFetch } = scripted([
      async () => new Response("slow down", { status: 429, headers: { "retry-after": "3600" } }),
      async () => ok(),
    ]);
    await fetchWithRetry(URL_, { doFetch, pause: async (ms) => void waits.push(ms) });
    expect(waits).toEqual([30_000]);
  });

  it("does not retry a status that will not fix itself", async () => {
    const { doFetch, calls } = scripted([async () => new Response("gone", { status: 404, statusText: "Not Found" })]);
    await expect(fetchWithRetry(URL_, { doFetch, pause: noPause })).rejects.toThrow(/404/);
    expect(calls()).toBe(1);
  });
});
