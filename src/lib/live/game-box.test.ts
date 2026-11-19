import { describe, expect, it } from "vitest";

import { parseLiveBoxscore } from "./boxscore";
import game122 from "./fixtures/e2026-game122-boxscore.json";
import {
  BOX_COLUMNS,
  clockLabel,
  columnLeaders,
  isSortKey,
  nextSort,
  periodHeads,
  rowsFromLive,
  rowsFromStored,
  sortRows,
  teamTotals,
  type BoxRow,
} from "./game-box";

const live = parseLiveBoxscore(game122, "TEL", "DUB")!.game;

function row(overrides: Partial<BoxRow>): BoxRow {
  return {
    personCode: "000001", name: "Player, One", dorsal: "1", clubCode: "TEL", starter: false, onCourt: false,
    dnp: false, seconds: 600, pts: 0, fgm2: 0, fga2: 0, fgm3: 0, fga3: 0, ftm: 0, fta: 0, oreb: 0, dreb: 0,
    reb: 0, ast: 0, stl: 0, tov: 0, blk: 0, blka: 0, pf: 0, fd: 0, pm: 0, pir: 0, fantasyTenths: 0,
    ...overrides,
  };
}

describe("rowsFromLive", () => {
  it("reads every column from a real in-play response, and its sums agree with the score", () => {
    const rows = rowsFromLive(live.players);
    const home = rows.filter((entry) => entry.clubCode === "TEL");
    const away = rows.filter((entry) => entry.clubCode === "DUB");
    expect(teamTotals(home).pts).toBe(live.localScore);
    expect(teamTotals(away).pts).toBe(live.roadScore);
    for (const entry of rows) {
      expect(entry.pts).toBe(entry.fgm2 * 2 + entry.fgm3 * 3 + entry.ftm);
      expect(entry.reb).toBe(entry.oreb + entry.dreb);
    }
  });

  it("prefers the stored name, and writes the feed's capitals as a person would", () => {
    const [first] = live.players;
    const named = rowsFromLive([first!], { names: new Map([[first!.personCode, "Stored, Name"]]) });
    expect(named[0]!.name).toBe("Stored, Name");
    expect(rowsFromLive([{ ...first!, name: "DE COLO, NANDO" }])[0]!.name).toBe("De Colo, Nando");
    expect(rowsFromLive([{ ...first!, name: "O'NEALE, JAE'SEAN" }])[0]!.name).toBe("O'Neale, Jae'Sean");
  });

  it("reads a snapshot written before the full line as zeros, not a crash", () => {
    const old = { personCode: "1", clubCode: "TEL", points: 4, assists: 1, rebounds: 2, pir: 5, fantasyTenths: 50, minutes: "10:00", playing: true };
    expect(rowsFromLive([old])[0]).toMatchObject({ pts: 4, reb: 2, fgm2: 0, starter: null, dnp: false, name: "1" });
  });

  it("scores under BasketNews for a league that mirrors it", () => {
    const [first] = live.players;
    expect(rowsFromLive([first!], { basketNews: true })[0]!.fantasyTenths).toBe(first!.basketNewsTenths);
  });

  it("marks a listed player who has not played", () => {
    const [first] = live.players;
    expect(rowsFromLive([{ ...first!, minutes: "DNP", playing: false }])[0]!.dnp).toBe(true);
  });
});

describe("rowsFromStored", () => {
  it("reads the recorded box score with the player's stored name", () => {
    const rows = rowsFromStored(
      [{ player: "p1", club_code: "TEL", time_played: 1450, points: 12, fgm2: 3, fga2: 5, fgm3: 2, fga3: 4, reb_total: 6, reb_off: 2, reb_def: 4, pir: 15, fantasy_pts: 165, basketnews_raw_pts: 1640, started: "yes" }],
      new Map([["p1", { name: "Hoard, Jaylen", personCode: "006835" }]]),
    );
    expect(rows[0]).toMatchObject({ personCode: "006835", name: "Hoard, Jaylen", starter: true, seconds: 1450, pts: 12, fantasyTenths: 165, dnp: false });
    expect(rowsFromStored([{ player: "p1", club_code: "TEL", basketnews_raw_pts: 1640 }], new Map(), { basketNews: true })[0]).toMatchObject({ fantasyTenths: 164, dnp: true, starter: null });
  });
});

describe("sortRows", () => {
  const rows = [
    row({ name: "Bench, Big", seconds: 900, pts: 18, pir: 20 }),
    row({ name: "Starter, Quiet", starter: true, seconds: 1200, pts: 4, pir: 3 }),
    row({ name: "Sitting, Down", dnp: true, seconds: 0 }),
    row({ name: "Starter, Loud", starter: true, seconds: 1500, pts: 22, pir: 25 }),
  ];

  it("keeps the box score's order by default: starters by minutes, then the bench, DNP last", () => {
    expect(sortRows(rows, null).map((entry) => entry.name)).toEqual(["Starter, Loud", "Starter, Quiet", "Bench, Big", "Sitting, Down"]);
  });

  it("sorts high to low and back, with a DNP held at the foot either way", () => {
    expect(sortRows(rows, { key: "pts", direction: "desc" }).map((entry) => entry.name)).toEqual(["Starter, Loud", "Bench, Big", "Starter, Quiet", "Sitting, Down"]);
    expect(sortRows(rows, { key: "pts", direction: "asc" }).map((entry) => entry.name)).toEqual(["Starter, Quiet", "Bench, Big", "Starter, Loud", "Sitting, Down"]);
  });

  it("ranks shooting by makes, then by the better rate", () => {
    const shooters = [row({ name: "A", fgm3: 3, fga3: 9 }), row({ name: "B", fgm3: 3, fga3: 3 }), row({ name: "C", fgm3: 4, fga3: 12 })];
    expect(sortRows(shooters, { key: "fg3", direction: "desc" }).map((entry) => entry.name)).toEqual(["C", "B", "A"]);
  });
});

describe("nextSort", () => {
  it("cycles a head through high-to-low, low-to-high and the box score's own order", () => {
    const first = nextSort(null, "pir");
    expect(first).toEqual({ key: "pir", direction: "desc" });
    const second = nextSort(first, "pir");
    expect(second).toEqual({ key: "pir", direction: "asc" });
    expect(nextSort(second, "pir")).toBeNull();
    expect(nextSort(second, "pts")).toEqual({ key: "pts", direction: "desc" });
  });
});

describe("teamTotals", () => {
  it("adds every counting column and leaves plus-minus out", () => {
    const total = teamTotals([row({ pts: 10, pm: 6, fgm3: 2, fga3: 5 }), row({ pts: 7, pm: 6, fgm3: 1, fga3: 1 })]);
    expect(total).toMatchObject({ name: "Totals", pts: 17, pm: 0, fgm3: 3, fga3: 6 });
  });
});

describe("columnLeaders", () => {
  it("marks the best figure among those who played, never a turnover or foul", () => {
    const leaders = columnLeaders([row({ pts: 9, tov: 5 }), row({ pts: 14, tov: 1 }), row({ pts: 30, dnp: true })]);
    expect(leaders.pts).toBe(14);
    expect(leaders.tov).toBeUndefined();
    expect(leaders.ast).toBeUndefined();
  });
});

describe("clockLabel", () => {
  it("prints the period and time left as the scoreboard bug does", () => {
    expect(clockLabel(3, "04:12")).toBe("Q3 · 4:12");
    expect(clockLabel(2, "00:00")).toBe("Half time");
    expect(clockLabel(1, "00:00")).toBe("End of Q1");
    expect(clockLabel(5, "02:05")).toBe("OT1 · 2:05");
    expect(clockLabel(4, null)).toBe("Q4");
    expect(clockLabel(null, "04:12")).toBeNull();
  });
});

describe("periodHeads", () => {
  it("shows four quarters, and each overtime only once it is played", () => {
    expect(periodHeads([20, 20, 0, 0], [18, 22, 0, 0], 2)).toEqual(["Q1", "Q2", "Q3", "Q4"]);
    expect(periodHeads([20, 20, 20, 20, 9], [18, 22, 20, 20, 7], 5)).toEqual(["Q1", "Q2", "Q3", "Q4", "OT1"]);
    expect(periodHeads([20, 20, 20, 20, 9, 0], [18, 22, 20, 20, 9, 0], null)).toEqual(["Q1", "Q2", "Q3", "Q4", "OT1"]);
  });
});

describe("isSortKey", () => {
  it("accepts every column and nothing else", () => {
    for (const column of BOX_COLUMNS) expect(isSortKey(column.key)).toBe(true);
    expect(isSortKey("name")).toBe(false);
    expect(isSortKey(undefined)).toBe(false);
  });
});
