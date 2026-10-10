import { describe, expect, it } from "vitest";

import type { ScheduleRow } from "@/lib/fixtures/schedule";

import {
  CONFIDENCE_HIGH_GAMES,
  CONFIDENCE_MEDIUM_GAMES,
  OPPONENT_PRIOR_GAMES,
  RUN_MARGIN,
  confidenceOf,
  outlooksFor,
  runOf,
  type AdvisorLine,
  type PlayerOutlook,
} from "./outlook";

/**
 * A hand-built league: four clubs, AAA and BBB play each other, CCC and DDD
 * each other. Every judgement the waiver wire prints is earned here once.
 */

let code = 0;
function game(round: number, local: string, road: string, played: boolean, score: [number, number] = [80, 80]): ScheduleRow {
  code += 1;
  return {
    gameCode: code,
    round,
    played,
    localClub: local,
    roadClub: road,
    localScore: played ? score[0] : 0,
    roadScore: played ? score[1] : 0,
    utcDate: null,
  };
}

function line(
  player: string,
  club: string,
  at: ScheduleRow,
  { minutes, pir, started, modern }: { minutes: number; pir: number; started: boolean | null; modern?: number },
): AdvisorLine {
  const own = at.localClub === club ? at.localScore : at.roadScore;
  const other = at.localClub === club ? at.roadScore : at.localScore;
  return {
    player,
    club,
    round: at.round,
    gameCode: at.gameCode,
    seconds: minutes * 60,
    pir,
    modernHundredths: Math.round((modern ?? pir) * 100) + (own > other ? 150 : -150),
    won: own > other,
    started,
  };
}

/** Even clubs: every played game a draw-looking 80–80, so nobody is favoured. */
function evenSeason(rounds: number, upcoming: number) {
  const schedule: ScheduleRow[] = [];
  for (let round = 1; round <= rounds + upcoming; round += 1) {
    const played = round <= rounds;
    schedule.push(game(round, round % 2 ? "AAA" : "BBB", round % 2 ? "BBB" : "AAA", played));
    schedule.push(game(round, round % 2 ? "CCC" : "DDD", round % 2 ? "DDD" : "CCC", played));
  }
  return schedule;
}

type Spec = { minutes: number; pir: number; started: boolean | null; modern?: number };

/**
 * One identical player on every club, game for game, so every club concedes the
 * same and opponent strength is neutral. The player under test is `p` on `club`.
 */
function everyone(schedule: readonly ScheduleRow[], club: string, spec: (index: number) => Spec): AdvisorLine[] {
  const clubs = [...new Set(schedule.flatMap((row) => [row.localClub, row.roadClub]))];
  return clubs.flatMap((each) =>
    schedule
      .filter((row) => row.played && (row.localClub === each || row.roadClub === each))
      .map((at, index) => line(each === club ? "p" : `${each}-x`, each, at, spec(index))),
  );
}

const only = (rows: PlayerOutlook[], player: string) => {
  const found = rows.find((row) => row.player === player);
  if (!found) throw new Error(`no outlook for ${player}`);
  return found;
};

describe("outlooksFor", () => {
  it("rates a player just promoted to the starting five on a starter's minutes", () => {
    const schedule = evenSeason(6, 5);
    // 0.5 PIR a minute throughout: 15 minutes off the bench, then 30 as a starter.
    const lines = everyone(schedule, "AAA", (index) =>
      index < 4 ? { minutes: 15, pir: 7.5, started: false } : { minutes: 30, pir: 15, started: true },
    );
    const [outlook] = outlooksFor({
      ruleset: "euroleague",
      players: [{ id: "p", club: "AAA" }],
      current: { lines, schedule },
      last: { lines: [], schedule: [] },
    });

    expect(outlook).toMatchObject({ role: "starter", gamesInRole: 2, baseSource: "current" });
    // 0.5 × 30 minutes = 15 PIR, × 1.05 for an even game's half a win bonus.
    expect(outlook!.next[0]).toBe(1575);
  });

  it("reads minutes from his recent games when no start of his is known", () => {
    const schedule = evenSeason(3, 5);
    const lines = everyone(schedule, "AAA", () => ({ minutes: 30, pir: 15, started: null }));
    // Last season he came off the bench for 10 minutes; that must not decide this season.
    const lastSchedule = [game(1, "AAA", "BBB", true)];
    const lastLines = [line("p", "AAA", lastSchedule[0]!, { minutes: 10, pir: 5, started: false })];
    const [outlook] = outlooksFor({
      ruleset: "basketnews",
      players: [{ id: "p", club: "AAA" }],
      current: { lines, schedule },
      last: { lines: lastLines, schedule: lastSchedule },
    });
    expect(outlook).toMatchObject({ gamesInRole: 0, baseSource: "current" });
    expect(outlook!.next[0]).toBe(1500);
  });

  it("adds the win term the league's game scores: ×1.1 on a win, ±1.5 in BasketNews", () => {
    // AAA beats BBB by 4 every time, so AAA is the favourite next.
    const schedule: ScheduleRow[] = [];
    for (let round = 1; round <= 4; round += 1) schedule.push(game(round, "AAA", "BBB", true, [82, 78]));
    for (let round = 5; round <= 9; round += 1) schedule.push(game(round, "AAA", "BBB", false));
    const lines = everyone(schedule, "AAA", () => ({ minutes: 20, pir: 10, started: true, modern: 12 }));
    const input = {
      players: [{ id: "p", club: "AAA" }],
      current: { lines, schedule },
      last: { lines: [], schedule: [] },
    };

    const euroleague = only(outlooksFor({ ruleset: "euroleague", ...input }), "p");
    const basketnews = only(outlooksFor({ ruleset: "basketnews", ...input }), "p");

    // A favourite: more than half a bonus, less than a whole one.
    expect(euroleague.next[0]!).toBeGreaterThan(1050);
    expect(euroleague.next[0]!).toBeLessThan(1100);
    // Modern without its own win term is 12 a game; the favourite's term is positive and under 1.5.
    expect(basketnews.next[0]!).toBeGreaterThan(1200);
    expect(basketnews.next[0]!).toBeLessThan(1350);
  });

  it("gives an even game no BasketNews win term and half the Fantasy Challenge bonus", () => {
    const schedule = evenSeason(4, 5);
    const lines = everyone(schedule, "CCC", () => ({ minutes: 20, pir: 10, started: true, modern: 12 }));
    const input = { players: [{ id: "p", club: "CCC" }], current: { lines, schedule }, last: { lines: [], schedule: [] } };

    expect(only(outlooksFor({ ruleset: "euroleague", ...input }), "p").next[0]).toBe(1050);
    expect(only(outlooksFor({ ruleset: "basketnews", ...input }), "p").next[0]).toBe(1200);
  });

  it("pulls a club that gave up a lot in one game only part of the way from neutral", () => {
    // One round: every club's player put up 16, except CCC's 24 against DDD.
    const schedule = [game(1, "AAA", "BBB", true), game(1, "CCC", "DDD", true), game(2, "AAA", "DDD", false)];
    const lines = [
      line("a", "AAA", schedule[0]!, { minutes: 20, pir: 16, started: true }),
      line("b", "BBB", schedule[0]!, { minutes: 20, pir: 16, started: true }),
      line("c", "CCC", schedule[1]!, { minutes: 20, pir: 24, started: true }),
      line("d", "DDD", schedule[1]!, { minutes: 20, pir: 16, started: true }),
    ];
    const [outlook] = outlooksFor({
      ruleset: "basketnews",
      players: [{ id: "a", club: "AAA" }],
      current: { lines, schedule },
      last: { lines: [], schedule: [] },
    });
    // DDD gave up 24 where the league gave up 18 a game: 1.33× raw over one
    // game, shrunk with OPPONENT_PRIOR_GAMES games of neutral.
    const strength = ((24 / 18) * 1 + 1 * OPPONENT_PRIOR_GAMES) / (1 + OPPONENT_PRIOR_GAMES);
    expect(outlook!.next[0]).toBe(Math.round(16 * strength * 100));
  });

  it("leaves out a played game whose box score is not stored yet", () => {
    // The ingest marks fixtures played before it fetches their box scores.
    const schedule = evenSeason(3, 5);
    const lines = everyone(schedule, "AAA", () => ({ minutes: 20, pir: 10, started: true }));
    schedule.push(game(4, "CCC", "DDD", true));
    const [outlook] = outlooksFor({
      ruleset: "basketnews",
      players: [{ id: "p", club: "AAA" }],
      current: { lines, schedule },
      last: { lines: [], schedule: [] },
    });
    expect(outlook!.next[0]).toBe(1000);
  });

  it("does not count a postponed game, still unplayed after the club's later rounds", () => {
    const schedule = evenSeason(3, 0);
    // Round 2's other game never happened; AAA has played round 3 since.
    schedule.push(game(2, "AAA", "DDD", false));
    for (const round of [4, 5]) schedule.push(game(round, "AAA", "BBB", false));
    const lines = everyone(schedule, "AAA", () => ({ minutes: 20, pir: 10, started: true }));
    const [outlook] = outlooksFor({
      ruleset: "basketnews",
      players: [{ id: "p", club: "AAA" }],
      current: { lines, schedule },
      last: { lines: [], schedule: [] },
    });
    expect(outlook!.gamesAhead).toBe(2);
  });

  it("counts a club's next games, so a round it sits out adds no zero", () => {
    const schedule = evenSeason(3, 0);
    // AAA plays rounds 4, 6, 7, 8, 9 — nothing in round 5.
    for (const round of [4, 6, 7, 8, 9]) schedule.push(game(round, "AAA", "BBB", false));
    schedule.push(game(5, "BBB", "CCC", false));
    const lines = everyone(schedule, "AAA", () => ({ minutes: 20, pir: 10, started: true }));
    const [outlook] = outlooksFor({
      ruleset: "basketnews",
      players: [{ id: "p", club: "AAA" }],
      current: { lines, schedule },
      last: { lines: [], schedule: [] },
    });
    expect(outlook!.next[0]).toBe(1000);
  });

  it("leans on last season's line for a player with no game yet this season", () => {
    const lastSchedule = [game(1, "AAA", "BBB", true), game(2, "BBB", "AAA", true)];
    const lastLines = lastSchedule.map((at) => line("p", "AAA", at, { minutes: 25, pir: 12.5, started: true }));
    const [outlook] = outlooksFor({
      ruleset: "basketnews",
      players: [{ id: "p", club: "AAA" }],
      current: { lines: [], schedule: evenSeason(0, 5) },
      last: { lines: lastLines, schedule: lastSchedule },
    });
    expect(outlook).toMatchObject({ baseSource: "last", role: "starter", gamesInRole: 0 });
    expect(outlook!.next[0]).toBe(1250);
    expect(confidenceOf(outlook!)).toBe("low");
  });

  it("has nothing to say about a player with no game in either season", () => {
    expect(
      outlooksFor({
        ruleset: "euroleague",
        players: [{ id: "new", club: "AAA" }],
        current: { lines: [], schedule: evenSeason(2, 5) },
        last: { lines: [], schedule: [] },
      }),
    ).toEqual([]);
  });

  it("labels each window's run from the opponents in it", () => {
    const schedule = evenSeason(4, 15);
    const lines = everyone(schedule, "AAA", () => ({ minutes: 20, pir: 10, started: true }));
    const [outlook] = outlooksFor({
      ruleset: "euroleague",
      players: [{ id: "p", club: "AAA" }],
      current: { lines, schedule },
      last: { lines: [], schedule: [] },
    });
    expect(outlook!.runs).toEqual(["even", "even", "even"]);
  });
});

describe("runOf", () => {
  it("calls a run easy or hard only past RUN_MARGIN either side of neutral", () => {
    expect(runOf(1 + RUN_MARGIN)).toBe("easy");
    expect(runOf(1 + RUN_MARGIN - 0.001)).toBe("even");
    expect(runOf(1 - RUN_MARGIN + 0.001)).toBe("even");
    expect(runOf(1 - RUN_MARGIN)).toBe("hard");
  });
});

describe("confidenceOf", () => {
  const at = (gamesInRole: number) => confidenceOf({ gamesInRole, baseSource: "current" });

  it("is high from CONFIDENCE_HIGH_GAMES games in his current role", () => {
    expect(at(CONFIDENCE_HIGH_GAMES)).toBe("high");
    expect(at(CONFIDENCE_HIGH_GAMES - 1)).toBe("medium");
  });

  it("is medium from CONFIDENCE_MEDIUM_GAMES, and low under it", () => {
    expect(at(CONFIDENCE_MEDIUM_GAMES)).toBe("medium");
    expect(at(CONFIDENCE_MEDIUM_GAMES - 1)).toBe("low");
    expect(at(1)).toBe("low");
  });

  it("is low whenever the base is last season's", () => {
    expect(confidenceOf({ gamesInRole: 20, baseSource: "last" })).toBe("low");
  });
});
