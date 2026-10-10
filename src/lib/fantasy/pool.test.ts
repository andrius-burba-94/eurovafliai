import { describe, expect, it, vi } from "vitest";

import { fetchPlayerPool } from "./client";
import { parseGameConfig, parsePlayerPoolPage } from "./parse";
import capture from "./fixtures/player-pool-api.json";

vi.mock("@/lib/euroleague/http", () => ({ sleep: () => Promise.resolve() }));

const rows = capture.response.data;
const config = { data: { current_players_list_id: 49, current_matchday: { id: 1531, number: 4, num_rounds: 3 } } };

describe("parsePlayerPoolPage", () => {
  it("reads every player the game lists, without its coaches", () => {
    const page = parsePlayerPoolPage(capture.response);
    expect(rows).toHaveLength(356);
    expect(page.players).toHaveLength(336);
    expect(page.lastPage).toBe(1);
    const counts = { G: 0, F: 0, C: 0 };
    for (const player of page.players) counts[player.position] += 1;
    expect(counts).toEqual({ G: 151, F: 119, C: 66 });
  });

  it("keeps the official id, jersey and club a match needs", () => {
    const omoruyi = parsePlayerPoolPage(capture.response).players.find((player) => player.lastName === "Omoruyi");
    expect(omoruyi).toMatchObject({ firstName: "Eugene", position: "F", club: { name: expect.any(String) } });
    expect(omoruyi?.id).toMatch(/^\d+$/);
  });

  it("refuses a page whose shape changed rather than reading half of it", () => {
    expect(() => parsePlayerPoolPage({ data: [{ id: 1 }], meta: { last_page: 1 } })).toThrow(/changed shape/);
  });
});

describe("parseGameConfig", () => {
  it("names the current players list and matchday", () => {
    expect(parseGameConfig(config)).toEqual({ playersListId: 49, matchdayId: 1531 });
  });
});

describe("fetchPlayerPool", () => {
  it("reads the current matchday's list page by page, with the token", async () => {
    const half = Math.ceil(rows.length / 2);
    const pages = [rows.slice(0, half), rows.slice(half)];
    const calls: { url: string; auth: string | null }[] = [];
    const doFetch = (async (url: string, init?: RequestInit) => {
      calls.push({ url, auth: new Headers(init?.headers).get("authorization") });
      if (url.endsWith("/leagues/10/config")) return Response.json(config);
      const page = Number(new URL(url).searchParams.get("page"));
      return Response.json({ data: pages[page - 1], meta: { current_page: page, last_page: 2 } });
    }) as typeof fetch;

    const players = await fetchPlayerPool("tok", doFetch);

    expect(players).toHaveLength(336);
    expect(calls.map((call) => call.url)).toEqual([
      "https://fantaking-api.dunkest.com/api/v1/leagues/10/config",
      "https://fantaking-api.dunkest.com/api/v1/players-lists/49/matchdays/1531/players?per_page=500&page=1",
      "https://fantaking-api.dunkest.com/api/v1/players-lists/49/matchdays/1531/players?per_page=500&page=2",
    ]);
    expect(calls.every((call) => call.auth === "Bearer tok")).toBe(true);
  });
});
