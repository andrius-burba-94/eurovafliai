import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { basketNewsPlayer, type BasketNewsSourcePlayer } from "@/lib/basketnews/client";
import type { Position } from "@/lib/engine";
import fantasyCapture from "@/lib/fantasy/fixtures/player-pool-api.json";
import { parsePlayerPoolPage, type FantasyPlayer } from "@/lib/fantasy/parse";

import { countsTemplate, planPositionRead, signableIn, type StoredPlayer } from "./plan";

const fixture = (path: string) => JSON.parse(readFileSync(new URL(`../../../tests/fixtures/${path}`, import.meta.url), "utf8"));

const fantasyRead = parsePlayerPoolPage(fantasyCapture.response).players;
const basketNewsRead = (fixture("basketnews-player-pool-api.json").response.data.playersSearchRecordsFromClient.records as BasketNewsSourcePlayer[])
  .filter((player) => player.team)
  .map(basketNewsPlayer);

type PoolRow = { id: string; name: string; name_normalized: string; club_code: string; club_name: string; dorsal?: string; status?: string };
const ourPool = fixture("basketnews-pool.json") as PoolRow[];

function stored(overrides: (row: PoolRow) => Partial<StoredPlayer> = () => ({})): StoredPlayer[] {
  return ourPool.map((row) => ({
    id: row.id,
    name: row.name,
    nameNormalized: row.name_normalized,
    clubCode: row.club_code,
    clubName: row.club_name,
    dorsal: row.dorsal ?? "",
    fantasyId: "",
    status: row.status ?? "",
    sourceId: "",
    position: null,
    confirmed: false,
    listed: false,
    ...overrides(row),
  }));
}

/** Stored players as a plan would leave them, so a second read can be planned against the first. */
function applied(players: StoredPlayer[], plan: ReturnType<typeof planPositionRead>): StoredPlayer[] {
  const links = new Map(plan.links.map((link) => [link.playerId, link.sourceId]));
  const additions = new Map(plan.additions.map((addition) => [addition.playerId, addition.position]));
  const listed = new Map(plan.listed.map((change) => [change.playerId, change.listed]));
  return players.map((player) => ({
    ...player,
    sourceId: links.get(player.id) ?? player.sourceId,
    position: additions.get(player.id) ?? player.position,
    listed: listed.get(player.id) ?? player.listed,
  }));
}

const omoruyi = ourPool.find((row) => row.name.startsWith("Omoruyi, Eugene"))!;

describe("planPositionRead on the Fantasy Challenge's real pool", () => {
  const plan = planPositionRead(fantasyRead, stored());

  it("adds a position for every player it can place, and asks nothing", () => {
    expect(plan.additions).toHaveLength(333);
    expect(plan.links).toHaveLength(333);
    expect(plan.questions).toEqual([]);
    expect(plan.unmatched.map((player) => player.lastName).sort()).toEqual(["Mijailovic", "Papas", "Payne"]);
  });

  it("marks every placed player listed", () => {
    expect(plan.listed.filter((change) => change.listed)).toHaveLength(333);
  });

  it("reads Omoruyi as a forward", () => {
    expect(plan.additions.find((addition) => addition.playerId === omoruyi.id)?.position).toBe("F");
  });

  it("plans nothing on a second read of the same pool", () => {
    const again = planPositionRead(fantasyRead, applied(stored(), plan));
    expect(again).toMatchObject({ links: [], additions: [], questions: [], listed: [] });
  });
});

describe("planPositionRead on BasketNews's real pool", () => {
  it("never changes a stored position: a different one becomes a question", () => {
    const players = stored((row) => (row.id === omoruyi.id ? { position: "F" as Position } : {}));
    const plan = planPositionRead(basketNewsRead, players);
    expect(plan.questions).toEqual([{ playerId: omoruyi.id, stored: "F", read: "C" }]);
    expect(plan.additions.some((addition) => addition.playerId === omoruyi.id)).toBe(false);
  });

  it("leaves a confirmed position alone, with no question", () => {
    const players = stored((row) => (row.id === omoruyi.id ? { position: "F" as Position, confirmed: true } : {}));
    const plan = planPositionRead(basketNewsRead, players);
    expect(plan.questions).toEqual([]);
    expect(plan.additions.some((addition) => addition.playerId === omoruyi.id)).toBe(false);
  });

  it("adds only where nothing is stored", () => {
    const plan = planPositionRead(basketNewsRead, stored());
    expect(plan.additions).toHaveLength(323);
    expect(plan.questions).toEqual([]);
  });
});

describe("planPositionRead, who is linked and who is listed", () => {
  const entry = (overrides: Partial<FantasyPlayer>): FantasyPlayer => ({
    id: "9001", firstName: "Eugene", lastName: "Omoruyi", jersey: "", position: "F",
    club: { id: "c1", name: omoruyi.club_name }, ...overrides,
  });

  it("trusts a stored link over the name", () => {
    const players = stored((row) => (row.id === omoruyi.id ? { sourceId: "9001", position: "F" as Position, listed: true } : {}));
    const plan = planPositionRead([entry({ lastName: "Somebody Else" })], players);
    expect(plan).toMatchObject({ links: [], additions: [], questions: [], unmatched: [] });
  });

  it("will not move a link: a player linked to another id is not matched again", () => {
    const players = stored((row) => (row.id === omoruyi.id ? { sourceId: "1234" } : {}));
    const plan = planPositionRead([entry({})], players);
    expect(plan.links).toEqual([]);
    expect(plan.additions).toEqual([]);
    expect(plan.unmatched).toHaveLength(1);
  });

  it("unlists a player the game no longer lists, but only when his club was read", () => {
    const sameClub = ourPool.find((row) => row.club_code === omoruyi.club_code && row.id !== omoruyi.id)!;
    const elsewhere = ourPool.find((row) => row.club_code !== omoruyi.club_code)!;
    const players = stored((row) => (row.id === sameClub.id || row.id === elsewhere.id ? { sourceId: `x${row.id}`, position: "G" as Position, listed: true } : {}));
    const plan = planPositionRead([entry({})], players);
    expect(plan.listed).toContainEqual({ playerId: sameClub.id, listed: false });
    expect(plan.listed.some((change) => change.playerId === elsewhere.id)).toBe(false);
  });
});

describe("countsTemplate", () => {
  const template = { G: 5, F: 5, C: 3 };
  const roster = (g: number, f: number, c: number): Position[] => [
    ...Array<Position>(g).fill("G"), ...Array<Position>(f).fill("F"), ...Array<Position>(c).fill("C"),
  ];

  it("accepts exactly 5 G, 5 F and 3 C", () => {
    expect(countsTemplate(roster(5, 5, 3), template)).toBe(true);
  });

  it("refuses any other count, including a short roster", () => {
    expect(countsTemplate(roster(5, 6, 2), template)).toBe(false);
    expect(countsTemplate(roster(5, 5, 2), template)).toBe(false);
  });
});

describe("signableIn", () => {
  const pool = [
    { id: "a", basketnews_listed: true, fantasy_listed: false },
    { id: "b", basketnews_listed: false, fantasy_listed: true },
    { id: "c" },
  ];

  it("keeps only the players a linked league's game lists", () => {
    expect(signableIn(pool, "basketnews").map((player) => player.id)).toEqual(["a"]);
    expect(signableIn(pool, "fantasy").map((player) => player.id)).toEqual(["b"]);
  });

  it("keeps everybody in a league that plays only here", () => {
    expect(signableIn(pool, "euroleague")).toHaveLength(3);
  });

  it("keeps everybody until the game has been read once", () => {
    expect(signableIn([{ id: "a" }, { id: "b", fantasy_listed: false }], "fantasy")).toHaveLength(2);
  });
});
