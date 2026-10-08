import { describe, expect, it, vi } from "vitest";

import { fakePb, type FakePb } from "../../../tests/unit/helpers/fake-pb";

vi.mock("server-only", () => ({}));

let fake: FakePb;
vi.mock("@/lib/pb/server", () => ({ createUserClient: () => fake.client }));
vi.mock("@/lib/stats/queries", () => ({ readStandingsSnapshots: async () => [] }));

const { readMatchdayData } = await import("./queries");

const LEAGUE = "league_1";

function round4() {
  fake = fakePb({
    data: {
      fixtures: [
        { id: "g1", season: "E2026", round: 4, game_code: 31, local_club: "RED", road_club: "ZAL", played: true, utc_date: "2026-10-07T17:00:00Z" },
        { id: "g2", season: "E2026", round: 4, game_code: 32, local_club: "TEL", road_club: "BES", played: false, utc_date: "2026-10-08T18:00:00Z" },
      ],
      player_game_stats: [{ id: "s1", player: "done", season: "E2026", round: 4, game_code: 31, phase: "RS", fantasy_pts: 99, basketnews_raw_pts: 1250 }],
      live_game_snapshots: [{
        id: "l1", season: "E2026", game_code: 32, round: 4, live: true, local_score: 40, road_score: 38, checked_at: "2026-10-08T18:30:00Z",
        players: [{ personCode: "010781", clubCode: "TEL", points: 6, assists: 0, rebounds: 2, pir: 8, fantasyTenths: 88, basketNewsTenths: 85, minutes: "12:20", playing: true }],
      }],
      players: [
        { id: "done", name: "Done Player", person_code: "011111" },
        { id: "live", name: "Live Player", person_code: "010781" },
      ],
      roster_memberships: [
        { id: "m1", league: LEAGUE, member: "a", player: "done", from_round: 1 },
        { id: "m2", league: LEAGUE, member: "b", player: "live", from_round: 1 },
      ],
      round_lineups: [],
    },
  });
}

describe("readMatchdayData", () => {
  it("scores a BasketNews league from its own points, recorded in hundredths and live in Modern", async () => {
    round4();
    const input = { leagueId: LEAGUE, memberIds: ["a", "b"], season: "E2026", requestedRound: 4, token: "t" };
    const basketNews = await readMatchdayData({ ...input, basketNews: true });
    expect(basketNews.scoresByPlayer).toEqual({ done: 125, live: 85 });
    expect(basketNews.final).toBe(false);
    const euroleague = await readMatchdayData(input);
    expect(euroleague.scoresByPlayer).toEqual({ done: 99, live: 88 });
  });
});
