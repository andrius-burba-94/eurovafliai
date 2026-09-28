import { describe, expect, it } from "vitest";

import { parseLiveBoxscore } from "./boxscore";

// Field names and player code padding match the official E2026 game 1 response
// fetched on 2026-09-28. The in-game values below are synthetic until an actual
// live game can establish how the endpoint updates.
const response = {
  Live: true,
  ByQuarter: [
    { Team: "CRVENA ZVEZDA MERIDIANBET BELGRADE", Quarter1: 21, Quarter2: 24, Quarter3: 12, Quarter4: 0 },
    { Team: "ZALGIRIS KAUNAS", Quarter1: 28, Quarter2: 15, Quarter3: 16, Quarter4: 0 },
  ],
  Stats: [
    { Team: "CRVENA ZVEZDA MERIDIANBET BELGRADE", PlayersStats: [{ Player_ID: "P011157   ", Team: "RED", Minutes: "14:08", Points: 2, Assistances: 2, TotalRebounds: 0, Valuation: -13, IsPlaying: 0 }] },
    { Team: "ZALGIRIS KAUNAS", PlayersStats: [{ Player_ID: "P012720   ", Team: "ZAL", Minutes: "16:19", Points: 10, Assistances: 0, TotalRebounds: 2, Valuation: 11, IsPlaying: 1 }] },
  ],
};

describe("parseLiveBoxscore", () => {
  it("reads provisional leader bonus, PIR and activity from official fields", () => {
    const game = parseLiveBoxscore(response, "RED", "ZAL");
    expect(game).toMatchObject({ live: true, localScore: 57, roadScore: 59 });
    expect(game?.players).toEqual([
      { personCode: "P011157", clubCode: "RED", points: 2, assists: 2, rebounds: 0, pir: -13, fantasyTenths: -130, minutes: "14:08", playing: false },
      { personCode: "P012720", clubCode: "ZAL", points: 10, assists: 0, rebounds: 2, pir: 11, fantasyTenths: 121, minutes: "16:19", playing: true },
    ]);
  });

  it("never calls a finished player in play even if the feed leaves IsPlaying set", () => {
    const game = parseLiveBoxscore({ ...response, Live: false }, "RED", "ZAL");
    expect(game?.players[1]?.playing).toBe(false);
  });

  it("does not publish an empty pregame box score", () => {
    expect(parseLiveBoxscore({ Live: false, Stats: [{ PlayersStats: [] }, { PlayersStats: [] }] }, "RED", "ZAL")).toBeNull();
  });
});
