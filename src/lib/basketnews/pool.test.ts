import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { readBasketNewsPlayerPool } from "./client";

const capture = JSON.parse(readFileSync(new URL("../../../tests/fixtures/basketnews-player-pool-api.json", import.meta.url), "utf8")) as {
  response: { data: { playersSearchRecordsFromClient: { records: { team: unknown }[] } } };
};

function answering(body: unknown) {
  const sent: unknown[] = [];
  const doFetch = (async (_url: string, init?: RequestInit) => {
    sent.push(JSON.parse(String(init?.body)));
    return Response.json(body);
  }) as typeof fetch;
  return { doFetch, sent };
}

describe("readBasketNewsPlayerPool", () => {
  it("reads every player the game lists, in our position letters", async () => {
    const { doFetch, sent } = answering(capture.response);
    const players = await readBasketNewsPlayerPool("6a7ae0128b647e038c999860", doFetch);
    expect(players).toHaveLength(331);
    const counts = { G: 0, F: 0, C: 0 };
    for (const player of players) counts[player.position] += 1;
    expect(counts).toEqual({ G: 153, F: 106, C: 72 });
    expect(players.find((player) => player.lastName === "Omoruyi")?.position).toBe("C");
    expect(sent[0]).toMatchObject({ variables: { league: "6a7ae0128b647e038c999860" } });
  });

  it("skips a player BasketNews lists without a club", async () => {
    const records = capture.response.data.playersSearchRecordsFromClient.records;
    const body = { data: { playersSearchRecordsFromClient: { records: [{ ...records[0], team: null }, records[1]] } } };
    const players = await readBasketNewsPlayerPool("6a7ae0128b647e038c999860", answering(body).doFetch);
    expect(players).toHaveLength(1);
  });
});
