import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSeasonRosters } from "./euroleague";

/**
 * The API front door, driven by a stubbed `fetch`.
 *
 * `doFetch` is injectable precisely so these can be tested without a network:
 * the shape traps and the retry policy are the parts that bite, and both are
 * cheap to assert and expensive to discover on draft night.
 */

/** `/clubs` is enveloped; a club's `/people` is a bare array. */
function serve(
  rows: unknown[],
  clubs = [{ code: "ZAL", name: "Zalgiris Kaunas" }],
) {
  return (async (url: string | URL) => {
    if (String(url).endsWith("/clubs")) return Response.json({ data: clubs });
    return Response.json(rows);
  }) as unknown as typeof fetch;
}

const player = {
  person: {
    code: "1",
    name: "SIRVYDIS, DEIVIDAS",
    passportName: "DEIVIDAS",
    passportSurname: "SIRVYDIS",
  },
  type: "J",
  typeName: "Player",
  positionName: "Guard",
  dorsal: "7",
  club: { code: "ZAL", name: "Zalgiris Kaunas" },
  season: { name: "EuroLeague 2026-27" },
};

const coach = {
  person: { code: "2", name: "MASIULIS, TOMAS" },
  // The real value. This file's research said "T" for a while; an exclusion
  // filter written from that would have drafted twenty coaches.
  type: "E",
  typeName: "Coach",
  club: { code: "ZAL", name: "Zalgiris Kaunas" },
};

afterEach(() => {
  vi.useRealTimers();
});

describe("fetchSeasonRosters", () => {
  it("reads both response shapes and keeps only players", async () => {
    const out = await fetchSeasonRosters({ doFetch: serve([player, coach]) });

    expect(out.clubs).toBe(1);
    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]).toMatchObject({
      name: "Sirvydis, Deividas",
      club_code: "ZAL",
      position: "G",
      dorsal: "7",
      source: "api",
    });
    expect(out.seasonName).toBe("EuroLeague 2026-27");
    expect(out.problems).toEqual([]);
  });

  it("turns one unreadable row into a problem rather than losing the club", async () => {
    // A single malformed player should not cost the other 323.
    const out = await fetchSeasonRosters({
      doFetch: serve([{ ...player, club: { code: "", name: "" } }, player]),
    });

    expect(out.rows).toHaveLength(1);
    expect(out.problems.join(" ")).toMatch(/club/i);
  });

  it("reports an unmapped position loudly and keeps the rest of the pool", async () => {
    // The design question this test settles. An unmapped position means the
    // feed's vocabulary changed, and `mapApiPosition` refuses to guess a bucket
    // — a wrong bucket would make `isLegalPick` enforce the wrong roster shape.
    //
    // But refusing the *whole sync* would be worse than it sounds: in September
    // it would mean no signing and no departure could be ingested at all until
    // somebody shipped code. So the affected player is skipped, every other
    // player still updates, and the reason is recorded — printed by the sync
    // script, stored on the `roster_imports` batch, and enough to make the
    // script exit non-zero so an unattended run cannot pass quietly.
    const out = await fetchSeasonRosters({
      doFetch: serve([
        { ...player, positionName: "Guard-Forward" },
        { ...player, person: { code: "9", name: "FINE, PLAYER" } },
      ]),
    });

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.name).toBe("Fine, Player");
    expect(out.problems.join(" ")).toMatch(/Guard-Forward/);
  });

  it("retries a rate-limited request and then succeeds", async () => {
    vi.useFakeTimers();
    let calls = 0;
    const waits: string[] = [];

    const doFetch = (async (url: string | URL) => {
      calls += 1;
      if (calls <= 2) {
        return new Response("slow down", {
          status: 429,
          headers: { "retry-after": "2" },
        });
      }
      if (String(url).endsWith("/clubs")) {
        return Response.json({ data: [{ code: "ZAL", name: "Zalgiris" }] });
      }
      return Response.json([player]);
    }) as unknown as typeof fetch;

    const pending = fetchSeasonRosters({
      doFetch,
      onProgress: (message) => waits.push(message),
    });
    // Two rate-limited attempts, each asking for 2 seconds.
    await vi.advanceTimersByTimeAsync(10_000);
    const out = await pending;

    expect(calls).toBe(4); // 429, 429, clubs, people
    expect(waits).toHaveLength(2);
    expect(waits[0]).toMatch(/429/);
    expect(waits[0]).toMatch(/2s/); // honoured Retry-After rather than backing off
    expect(out.rows).toHaveLength(1);
  });

  it("gives up after a bounded number of attempts, and says why", async () => {
    vi.useFakeTimers();
    const doFetch = (async () =>
      new Response("nope", { status: 429 })) as unknown as typeof fetch;

    const pending = fetchSeasonRosters({ doFetch });
    // Attach the rejection handler before advancing, or Node sees an unhandled one.
    const assertion = expect(pending).rejects.toThrow(/rate-limiting/);
    await vi.advanceTimersByTimeAsync(60_000);
    await assertion;
  });

  it("does not retry a 404, which will not fix itself", async () => {
    const doFetch = (async () =>
      new Response("gone", { status: 404 })) as unknown as typeof fetch;

    await expect(fetchSeasonRosters({ doFetch })).rejects.toThrow(/404/);
  });
});
