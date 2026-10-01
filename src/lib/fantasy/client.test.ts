import { describe, expect, it, vi } from "vitest";

import { FantasyTokenRefused, fetchCurrentMatchday, fetchLeagueRosters, fetchRoundLineup } from "./client";
import rostersJson from "./fixtures/league-rosters.json";
import lineupsJson from "./fixtures/round-2-lineups.json";
import teamsJson from "./fixtures/user-fantasy-teams.json";

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

function serving(body: unknown, status = 200) {
  const calls: string[] = [];
  const doFetch = (async (url: string) => {
    calls.push(url);
    return new Response(JSON.stringify(body), { status });
  }) as typeof fetch;
  return { doFetch, calls };
}

describe("fetchRoundLineup", () => {
  it("reads another manager's lineup through the league-visible preview", async () => {
    const { doFetch, calls } = serving(lineupsJson["2827842"]);
    const lineup = await fetchRoundLineup("tok", "2827842", 1529, doFetch);
    expect(calls).toEqual(["https://fantaking-api.dunkest.com/api/v1/fantasy-teams/2827842/matchdays/1529/roster/preview"]);
    expect(lineup.pts).toBe(159.9);
    expect(lineup.players).toHaveLength(10);
  });

  it("names the team whose lineup was refused", async () => {
    const { doFetch } = serving({}, 403);
    await expect(fetchRoundLineup("tok", "2827842", 1529, doFetch)).rejects.toThrow(/team 2827842's lineup \(403\)/);
  });
});

describe("fetchCurrentMatchday", () => {
  it("asks for the token owner's EuroLeague Draft Mode teams", async () => {
    const { doFetch, calls } = serving(teamsJson);
    await expect(fetchCurrentMatchday("tok", "147868", doFetch)).resolves.toEqual({ id: 1530, number: 3 });
    expect(calls).toEqual(["https://fantaking-api.dunkest.com/api/v1/user/fantasy-teams?league=10&game_mode=2"]);
  });
});
