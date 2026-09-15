import { afterEach, describe, expect, it, vi } from "vitest";

import { fetchSeasonRosters } from "./euroleague";

/**
 * The API front door, driven by a stubbed `fetch`.
 *
 * `doFetch` is injectable precisely so these can be tested without a network:
 * the shape traps and the retry policy are the parts that bite, and both are
 * cheap to assert and expensive to discover on draft night.
 */

/**
 * `/clubs` is enveloped; a club's `/people` is a bare array. The season-wide
 * `/people?limit=1000` is enveloped, and is only ever read for bios.
 *
 * `bios` defaults to the same rows, which is what the live feed does. Passing
 * something else is how the tests show that the club's roster — not the
 * season-wide registration history — decides what is in the pool.
 */
function serve(
  rows: unknown[],
  {
    clubs = [{ code: "ZAL", name: "Zalgiris Kaunas" }],
    bios,
  }: { clubs?: unknown[]; bios?: unknown[] | "fail" } = {},
) {
  return (async (url: string | URL) => {
    const target = String(url);
    if (target.includes("limit=1000")) {
      // 404 rather than 5xx: a 404 is not retried, so the test asserts the
      // degradation without waiting out a backoff.
      if (bios === "fail") return new Response("gone", { status: 404 });
      return Response.json({ data: bios ?? rows });
    }
    if (target.endsWith("/clubs")) return Response.json({ data: clubs });
    return Response.json(rows);
  }) as unknown as typeof fetch;
}

const player = {
  person: {
    code: "1",
    name: "SIRVYDIS, DEIVIDAS",
    passportName: "DEIVIDAS",
    passportSurname: "SIRVYDIS",
    height: 198,
    weight: 88,
    birthDate: "1999-06-30T00:00:00",
    country: { code: "LTU", name: "Lithuania" },
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

  it("carries the bio the feed has been sending all along", async () => {
    const out = await fetchSeasonRosters({ doFetch: serve([player]) });
    expect(out.rows[0]).toMatchObject({
      height: 198,
      weight: 88,
      birth_date: "1999-06-30T00:00:00",
      country_code: "LTU",
      country_name: "Lithuania",
    });
  });

  /**
   * The trap that cost a sync. `/{season}/people` is a **registration
   * history**, not a roster: it lists every spell a person has held this
   * season, so 23 of E2026's 332 rows name a player at both the club they left
   * and the club they joined. Measured on 2026-09-14 it disagreed with the
   * club walk in both directions — 79 pairs it invented, 60 it omitted — and
   * filtering to `active === true` reconciled neither.
   *
   * A player attached to their old club is marked `left` and vanishes from the
   * draft, so the club's own roster has to win. This test makes the bio
   * endpoint claim ZAL's player is at PAN and asserts the pool ignores it.
   */
  it("lets the club's roster decide the club, not the season-wide people list", async () => {
    const out = await fetchSeasonRosters({
      doFetch: serve([player], {
        bios: [
          { ...player, club: { code: "PAN", name: "Panathinaikos" } },
          { ...player, person: { ...player.person, code: "99" } },
        ],
      }),
    });

    expect(out.rows).toHaveLength(1);
    expect(out.rows[0]?.club_code).toBe("ZAL");
  });

  it("still syncs when the bio lookup fails, and says so", async () => {
    const said: string[] = [];
    const out = await fetchSeasonRosters({
      doFetch: serve([player], { bios: "fail" }),
      onProgress: (message) => said.push(message),
    });

    // A sync that cannot read heights must still be able to read signings.
    expect(out.rows).toHaveLength(1);
    expect(said.join(" ")).toMatch(/bios/i);
  });

  // One of 332 E2026 players has no height. Absence must stay absence rather
  // than becoming a 0 that `diffRosters` would write over a real measurement.
  it("omits a bio field the feed does not have, rather than storing a zero", async () => {
    const thin = {
      ...player,
      person: { ...player.person, height: 0, country: null },
    };
    const out = await fetchSeasonRosters({
      doFetch: serve([thin], { bios: [thin] }),
    });
    expect(out.rows[0]).not.toHaveProperty("height");
    expect(out.rows[0]).not.toHaveProperty("country_code");
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
      if (String(url).includes("limit=1000")) {
        return Response.json({ data: [player] });
      }
      return Response.json([player]);
    }) as unknown as typeof fetch;

    const pending = fetchSeasonRosters({
      doFetch,
      onProgress: (message) => waits.push(message),
    });
    // Two rate-limited attempts, each asking for 2 seconds, then the three
    // real requests: clubs, season bios, ZAL's roster.
    await vi.advanceTimersByTimeAsync(10_000);
    const out = await pending;

    expect(calls).toBe(5);
    expect(waits.filter((line) => line.includes("429"))).toHaveLength(2);
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
