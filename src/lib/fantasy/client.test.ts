import { describe, expect, it, vi } from "vitest";

import { FantasyTokenRefused, fetchLeagueRosters } from "./client";
import rostersJson from "./fixtures/league-rosters.json";

vi.mock("@/lib/euroleague/http", () => ({ sleep: () => Promise.resolve() }));

function answering(...statuses: number[]) {
  const calls: { url: string; auth: string | null }[] = [];
  const doFetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
    const status = statuses[Math.min(calls.length - 1, statuses.length - 1)]!;
    return new Response(status === 200 ? JSON.stringify(rostersJson) : "{}", { status });
  }) as typeof fetch;
  return { doFetch, calls };
}

describe("fetchLeagueRosters", () => {
  it("reads the league's rosters with the token as a bearer", async () => {
    const { doFetch, calls } = answering(200);
    const teams = await fetchLeagueRosters("tok", "147", doFetch);
    expect(teams).toHaveLength(8);
    expect(calls).toEqual([
      { url: "https://fantaking-api.dunkest.com/api/v1/fantasy-leagues/147/rosters", auth: "Bearer tok" },
    ]);
  });

  it("says the token was refused, without retrying", async () => {
    const { doFetch, calls } = answering(401);
    await expect(fetchLeagueRosters("tok", "147", doFetch)).rejects.toBeInstanceOf(FantasyTokenRefused);
    expect(calls).toHaveLength(1);
  });

  it("retries a rate limit and succeeds", async () => {
    const { doFetch, calls } = answering(429, 200);
    await expect(fetchLeagueRosters("tok", "147", doFetch)).resolves.toHaveLength(8);
    expect(calls).toHaveLength(2);
  });

  it("gives up after three failing attempts", async () => {
    const { doFetch, calls } = answering(503);
    await expect(fetchLeagueRosters("tok", "147", doFetch)).rejects.toThrow(/answered 503/);
    expect(calls).toHaveLength(3);
  });

  it("names a league the token cannot see", async () => {
    const { doFetch } = answering(403);
    await expect(fetchLeagueRosters("tok", "147", doFetch)).rejects.toThrow(/cannot see league 147/);
  });

  it("refuses a response of the wrong shape", async () => {
    const doFetch = (async () => new Response(JSON.stringify({ data: [{ id: 1 }] }), { status: 200 })) as typeof fetch;
    await expect(fetchLeagueRosters("tok", "147", doFetch)).rejects.toThrow(/changed shape/);
  });
});
