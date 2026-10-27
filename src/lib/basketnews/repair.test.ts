import { describe, expect, it, vi } from "vitest";
import { fakePb } from "../../../tests/unit/helpers/fake-pb";
import { repairBasketNewsMoves } from "./repair";
vi.mock("@/lib/stats/standings-store", () => ({ recomputeStandings: vi.fn(async () => {}) }));

function database() {
  const a = Array.from({ length: 13 }, (_, i) => `a${i}`);
  const b = Array.from({ length: 13 }, (_, i) => `b${i}`);
  const slots = (ids: string[]) => ({ starters: ids.slice(0, 5), captain: ids[0], sixth: [ids[5]], bench: ids.slice(6, 11), inactive: ids.slice(11) });
  return fakePb({ data: {
    leagues: [{ id: "league", season: "2026-27", basketnews_league_id: "source-league" }],
    league_members: [{ id: "a", basketnews_team_id: "source-a", team_name: "A" }, { id: "b", basketnews_team_id: "source-b", team_name: "B" }].map((row) => ({ ...row, league: "league" })),
    players: [...a, ...b].map((id) => ({ id, name: id, basketnews_id: id })),
    roster_memberships: [...a.map((player) => ({ id: player, member: "a", player })), ...b.map((player) => ({ id: player, member: "b", player }))].map((row) => ({ ...row, league: "league", from_round: 1, to_round: row.player === "a0" || row.player === "b0" ? 7 : 0 })),
    round_lineups: [{ id: "al", league: "league", season: "E2026", round: 7, member: "a", slots: slots(["b0", ...a.slice(1)]) }, { id: "bl", league: "league", season: "E2026", round: 7, member: "b", slots: slots(["a0", ...b.slice(1)]) }],
    transactions: [{ id: "old", league: "league", from_round: 7, type: "drop", members: ["a"], players_in: {}, players_out: { a: ["a0"] }, note: "BasketNews, round 7: snapshot release" }, { id: "manual", league: "league", from_round: 7, type: "drop", members: ["a"], players_in: {}, players_out: { a: ["a1"] }, note: "Commissioner" }],
  } });
}
const transfers = async () => [{ id: "event", type: "trade", status: "accepted", createdAt: "2026-10-20T10:00:00Z", updatedAt: "2026-10-21T13:03:25Z", offer: { fantasyTeamId: "source-a", players: [{ playerId: "a0" }] }, request: { fantasyTeamId: "source-b", players: [{ playerId: "b0" }] } }];

describe("historical BasketNews trade repair", () => {
  it("previews without writes, then repairs only source rows and is idempotent", async () => {
    const db = database();
    const input = { pb: db.client, leagueId: "league", round: 7, transfers };
    expect(await repairBasketNewsMoves({ ...input, write: false })).toMatchObject({ status: "verified", create: 1, remove: 1 });
    expect(db.writes).toHaveLength(0);
    expect(await repairBasketNewsMoves({ ...input, write: true })).toMatchObject({ status: "verified" });
    expect(db.rows("transactions")).toHaveLength(2);
    expect(db.rows("transactions").some((row) => row.id === "manual")).toBe(true);
    expect(db.rows("transactions").find((row) => row.source_event_id === "event")).toMatchObject({ type: "trade", date: expect.stringMatching(/^\d{4}-\d\d-\d\d \d/) });
    expect(db.writes.some((write) => write.includes("roster_memberships"))).toBe(false);
    expect(await repairBasketNewsMoves({ ...input, write: true })).toMatchObject({ create: 0, remove: 0 });
  });

  it("leaves history intact if an accepted log does not reach the official round rosters", async () => {
    const db = database();
    const result = await repairBasketNewsMoves({ pb: db.client, leagueId: "league", round: 7, write: true, transfers: async () => [] });
    expect(result.status).toBe("blocked");
    expect(db.writes).toHaveLength(0);
  });
});
