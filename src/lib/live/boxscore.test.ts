import { describe, expect, it } from "vitest";

import { parseLiveBoxscore, parseLiveHeader, periodsOf, personCodeOf, secondsOf, withHeader } from "./boxscore";
import game122 from "./fixtures/e2026-game122-boxscore.json";
import header122 from "./fixtures/e2026-game122-header.json";
import inPlay from "./fixtures/e2026-game19-in-play.json";

// Synthetic in-game values in the official field names; the real response
// they are modelled on is the game-19 fixture beside this file.
const response = {
  Live: true,
  ByQuarter: [
    { Team: "CRVENA ZVEZDA MERIDIANBET BELGRADE", Quarter1: 21, Quarter2: 24, Quarter3: 12, Quarter4: 0 },
    { Team: "ZALGIRIS KAUNAS", Quarter1: 28, Quarter2: 15, Quarter3: 16, Quarter4: 0 },
  ],
  Stats: [
    {
      Team: "CRVENA ZVEZDA MERIDIANBET BELGRADE",
      PlayersStats: [{
        Player_ID: "P011157   ", Player: "RED PLAYER", Minutes: "14:08", IsPlaying: 0,
        Points: 2, FieldGoalsMade2: 1, FieldGoalsAttempted2: 4, Assistances: 2, TotalRebounds: 0,
        Turnovers: 5, BlocksAgainst: 1, FoulsCommited: 4, Valuation: -9,
      }],
    },
    {
      Team: "ZALGIRIS KAUNAS",
      PlayersStats: [{
        Player_ID: "P012720   ", Player: "ZAL PLAYER", Minutes: "16:19", IsPlaying: 1,
        Points: 10, FieldGoalsMade2: 2, FieldGoalsAttempted2: 4, FieldGoalsMade3: 2, FieldGoalsAttempted3: 5,
        TotalRebounds: 2, FoulsReceived: 2, FoulsCommited: 1, Valuation: 8,
      }],
    },
  ],
};

describe("personCodeOf", () => {
  it("drops the live feed's padding and P prefix so the code joins the roster's", () => {
    expect(personCodeOf("P010781   ")).toBe("010781");
    expect(personCodeOf("010781")).toBe("010781");
  });
});

describe("secondsOf", () => {
  it("reads minutes:seconds and treats DNP as zero", () => {
    expect(secondsOf("12:20")).toBe(740);
    expect(secondsOf("090:00")).toBe(5400);
    expect(secondsOf("DNP")).toBe(0);
    expect(secondsOf(null)).toBe(0);
  });
});

describe("parseLiveBoxscore", () => {
  it("scores from components, with the provisional bonus for the side leading", () => {
    const parsed = parseLiveBoxscore(response, "RED", "ZAL");
    expect(parsed?.problems).toEqual([]);
    expect(parsed?.game).toMatchObject({ live: true, localScore: 57, roadScore: 59 });
    expect(parsed?.game.players).toEqual([
      expect.objectContaining({ personCode: "011157", clubCode: "RED", points: 2, assists: 2, rebounds: 0, pir: -9, fantasyTenths: -90, basketNewsTenths: -75, minutes: "14:08", playing: false }),
      expect.objectContaining({ personCode: "012720", clubCode: "ZAL", points: 10, assists: 0, rebounds: 2, pir: 8, fantasyTenths: 88, basketNewsTenths: 85, minutes: "16:19", playing: true }),
    ]);
  });

  it("agrees with the feed's own PIR on every row of a real in-play response", () => {
    const parsed = parseLiveBoxscore(inPlay, "TEL", "BES");
    expect(parsed).not.toBeNull();
    expect(parsed!.problems).toEqual([]);
    expect(parsed!.game).toMatchObject({ live: true, localScore: 42, roadScore: 50 });
    const rows = inPlay.Stats.flatMap((side) => side.PlayersStats);
    expect(parsed!.game.players).toHaveLength(rows.length);
    parsed!.game.players.forEach((player, index) => {
      expect(player.pir).toBe(rows[index]!.Valuation);
      expect(player.personCode).toMatch(/^\d{6}$/);
      expect(player.fantasyTenths).toBe(player.pir * (player.clubCode === "BES" ? 11 : 10));
    });
    expect(parsed!.game.players.find((player) => player.personCode === "010781")).toMatchObject({ clubCode: "TEL", points: 6, pir: 7, fantasyTenths: 70, minutes: "12:20" });
  });

  it("keeps a DNP row at zero and never calls it in play", () => {
    const dnp = parseLiveBoxscore(inPlay, "TEL", "BES")!.game.players.find((player) => player.minutes === "DNP");
    expect(dnp).toMatchObject({ points: 0, pir: 0, fantasyTenths: 0, playing: false });
  });

  it("reports a published PIR that disagrees with its components, and keeps ours", () => {
    const wrong = structuredClone(response);
    wrong.Stats[1]!.PlayersStats[0]!.Valuation = 12;
    const parsed = parseLiveBoxscore(wrong, "RED", "ZAL");
    expect(parsed?.game.players[1]).toMatchObject({ pir: 8, fantasyTenths: 88 });
    expect(parsed?.problems).toEqual([{ personCode: "012720", message: expect.stringContaining("PIR 12 does not match the 8") }]);
  });

  it("publishes full time with nobody in play", () => {
    const parsed = parseLiveBoxscore({ ...response, Live: false }, "RED", "ZAL");
    expect(parsed?.game.live).toBe(false);
    expect(parsed?.game.players.every((player) => !player.playing)).toBe(true);
  });

  it("does not publish lineups listed before tip-off", () => {
    const pregame = structuredClone(response);
    for (const side of pregame.Stats) for (const player of side.PlayersStats) player.Minutes = "00:00";
    expect(parseLiveBoxscore({ ...pregame, Live: false }, "RED", "ZAL")).toBeNull();
  });

  it("does not publish an empty pregame box score", () => {
    expect(parseLiveBoxscore({ Live: false, Stats: [{ PlayersStats: [] }, { PlayersStats: [] }] }, "RED", "ZAL")).toBeNull();
  });
});

describe("the full line, for the game page", () => {
  it("keeps every column the box score draws, from a real in-play response", () => {
    const parsed = parseLiveBoxscore(game122, "TEL", "DUB")!;
    expect(parsed.problems).toEqual([]);
    const rows = game122.Stats.flatMap((side) => side.PlayersStats);
    expect(parsed.game.players).toHaveLength(rows.length);
    parsed.game.players.forEach((player, index) => {
      const row = rows[index]!;
      expect(player.name).toBe(row.Player.trim());
      expect(player.dorsal).toBe(row.Dorsal.trim());
      expect(player.starter).toBe(row.IsStarter === 1);
      expect(player.box).toEqual({
        fgm2: row.FieldGoalsMade2, fga2: row.FieldGoalsAttempted2,
        fgm3: row.FieldGoalsMade3, fga3: row.FieldGoalsAttempted3,
        ftm: row.FreeThrowsMade, fta: row.FreeThrowsAttempted,
        oreb: row.OffensiveRebounds, dreb: row.DefensiveRebounds,
        stl: row.Steals, tov: row.Turnovers,
        blk: row.BlocksFavour, blka: row.BlocksAgainst,
        pf: row.FoulsCommited, fd: row.FoulsReceived,
        pm: row.Plusminus ?? 0,
      });
    });
    expect(parsed.game.players.filter((player) => player.starter)).toHaveLength(10);
  });

  it("carries each period's points, the sum of which is the score", () => {
    const { game } = parseLiveBoxscore(game122, "TEL", "DUB")!;
    expect(game.detail?.quarters.local.slice(0, 2)).toEqual([game122.ByQuarter[0]!.Quarter1, game122.ByQuarter[0]!.Quarter2]);
    expect(game.detail?.quarters.local.reduce((sum, points) => sum + points, 0)).toBe(game.localScore);
    expect(game.detail?.quarters.road.reduce((sum, points) => sum + points, 0)).toBe(game.roadScore);
    expect(game.detail).toMatchObject({ period: null, clock: null, teams: { local: "MACCABI RAPYD TEL AVIV", road: "DUBAI BASKETBALL" } });
  });
});

describe("periodsOf", () => {
  it("orders quarters, then extra periods, whatever order the keys arrive in", () => {
    expect(periodsOf({ Team: "X", Extra1: 9, Quarter2: 20, Quarter1: 18, Quarter4: 22, Quarter3: 17 })).toEqual([18, 20, 17, 22, 9]);
    expect(periodsOf(undefined)).toEqual([]);
  });
});

describe("parseLiveHeader", () => {
  it("reads the period and the time left in it from a real header", () => {
    expect(parseLiveHeader(header122)).toEqual({ period: 2, clock: "00:03" });
  });

  it("reads a break as a stopped clock with no period, and refuses a header with neither", () => {
    // Measured at half time of game 122: the feed blanks the quarter.
    expect(parseLiveHeader({ Quarter: "", RemainingPartialTime: "00:00" })).toEqual({ period: null, clock: "00:00" });
    expect(parseLiveHeader({ Quarter: "0" })).toBeNull();
    expect(parseLiveHeader({ Quarter: "3", RemainingPartialTime: "" })).toEqual({ period: 3, clock: null });
    expect(parseLiveHeader("not a header")).toBeNull();
  });
});

describe("withHeader", () => {
  const detail = { quarters: { local: [26, 21, 0, 0], road: [14, 26, 0, 0] }, period: null, clock: null };

  it("takes the header's period and clock while a period is on", () => {
    expect(withHeader(detail, { period: 3, clock: "07:41" })).toMatchObject({ period: 3, clock: "07:41" });
  });

  it("reads a break as the end of the last period anyone scored in", () => {
    expect(withHeader(detail, { period: null, clock: "00:00" })).toMatchObject({ period: 2, clock: "00:00" });
  });

  it("leaves the detail alone without a header or before anyone has scored", () => {
    expect(withHeader(detail, null)).toBe(detail);
    const empty = { ...detail, quarters: { local: [0, 0, 0, 0], road: [0, 0, 0, 0] } };
    expect(withHeader(empty, { period: null, clock: "00:00" })).toBe(empty);
  });
});
