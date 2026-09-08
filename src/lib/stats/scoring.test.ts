import { describe, expect, it } from "vitest";

import {
  type BoxScore,
  OFFICIAL_WEIGHTS,
  formatTenths,
  scoreGame,
  sumTenths,
} from "./scoring";

/**
 * The constructed half of the scoring tests. `scoring.golden.test.ts` proves
 * the formula against 168 real rows; this file states each component in
 * isolation, so a failure names the term that broke instead of naming 168
 * players.
 */
const EMPTY: BoxScore = {
  timePlayed: 0,
  points: 0,
  fieldGoalsMade2: 0,
  fieldGoalsAttempted2: 0,
  fieldGoalsMade3: 0,
  fieldGoalsAttempted3: 0,
  freeThrowsMade: 0,
  freeThrowsAttempted: 0,
  offensiveRebounds: 0,
  defensiveRebounds: 0,
  totalRebounds: 0,
  assistances: 0,
  steals: 0,
  turnovers: 0,
  blocksFavour: 0,
  blocksAgainst: 0,
  foulsCommited: 0,
  foulsReceived: 0,
  plusMinus: 0,
};

const line = (over: Partial<BoxScore>): BoxScore => ({ ...EMPTY, ...over });

describe("scoreGame — the components", () => {
  it("scores a did-not-play line as nothing, not as an error", () => {
    expect(scoreGame(EMPTY, false)).toEqual({
      base: 0,
      fantasyTenths: 0,
      wonBonus: false,
    });
  });

  it.each([
    ["points", { points: 7 }, 7],
    ["rebounds, from the total and not the split", { totalRebounds: 9 }, 9],
    ["assists", { assistances: 5 }, 5],
    ["steals", { steals: 3 }, 3],
    ["blocks by the player", { blocksFavour: 2 }, 2],
    ["fouls drawn", { foulsReceived: 4 }, 4],
    ["turnovers, negatively", { turnovers: 3 }, -3],
    ["shots blocked, negatively", { blocksAgainst: 2 }, -2],
    ["fouls committed, negatively", { foulsCommited: 5 }, -5],
  ])("counts %s", (_label, over, expected) => {
    expect(scoreGame(line(over), false).base).toBe(expected);
  });

  it("charges a missed two and a missed three the same", () => {
    expect(
      scoreGame(line({ fieldGoalsAttempted2: 4, fieldGoalsMade2: 1 }), false)
        .base,
    ).toBe(-3);
    expect(
      scoreGame(line({ fieldGoalsAttempted3: 4, fieldGoalsMade3: 1 }), false)
        .base,
    ).toBe(-3);
  });

  it("charges misses from the 2s and 3s together", () => {
    // The feed also sends `fieldGoalsAttemptedTotal`; we derive it, because a
    // stored total is a number that can disagree with its own parts.
    const box = line({
      fieldGoalsAttempted2: 7,
      fieldGoalsMade2: 3,
      fieldGoalsAttempted3: 5,
      fieldGoalsMade3: 2,
    });
    expect(scoreGame(box, false).base).toBe(-7);
  });

  it("charges missed free throws", () => {
    expect(
      scoreGame(line({ freeThrowsAttempted: 6, freeThrowsMade: 4 }), false)
        .base,
    ).toBe(-2);
  });

  it("does not count the points twice through the makes", () => {
    // 3/3 from two, 9 points: PIR is 9, not 12. The made shots contribute
    // nothing of their own — only the misses do.
    const box = line({
      points: 6,
      fieldGoalsMade2: 3,
      fieldGoalsAttempted2: 3,
    });
    expect(scoreGame(box, false).base).toBe(6);
  });

  it("ignores plus/minus and minutes entirely", () => {
    expect(
      scoreGame(line({ plusMinus: 22, timePlayed: 1850 }), false).base,
    ).toBe(0);
    expect(
      scoreGame(line({ plusMinus: -22, timePlayed: 1850 }), false).base,
    ).toBe(0);
  });
});

describe("scoreGame — the win bonus", () => {
  it("adds 10% on a win and nothing on a loss", () => {
    const box = line({ points: 20, totalRebounds: 10 });
    expect(scoreGame(box, false).fantasyTenths).toBe(300);
    expect(scoreGame(box, true).fantasyTenths).toBe(330);
  });

  it("makes a negative line worse on a win — the decided behaviour", () => {
    // Blueprint open question 3, settled in 4.1: the bonus is a multiplier and
    // is applied uniformly, because branching on the sign would be our
    // invention rather than the rulebook's, and it would put a discontinuity
    // at zero. Recorded as a test rather than a comment so that changing it is
    // deliberate: eight rows in the golden fixture are real negatives on a win.
    expect(scoreGame(line({ turnovers: 5 }), true).fantasyTenths).toBe(-55);
    expect(scoreGame(line({ turnovers: 5 }), false).fantasyTenths).toBe(-50);
  });

  it("reports whether the bonus applied, so nobody re-derives it", () => {
    expect(scoreGame(EMPTY, true).wonBonus).toBe(true);
    expect(scoreGame(EMPTY, false).wonBonus).toBe(false);
  });

  it("takes a league's own bonus, including none at all", () => {
    const box = line({ points: 10 });
    expect(scoreGame(box, true, OFFICIAL_WEIGHTS, 1).fantasyTenths).toBe(100);
    expect(scoreGame(box, true, OFFICIAL_WEIGHTS, 1.25).fantasyTenths).toBe(125);
  });
});

describe("scoreGame — weights are configuration", () => {
  it("stops punishing turnovers when a league says so", () => {
    const box = line({ points: 10, turnovers: 4 });
    expect(scoreGame(box, false).base).toBe(6);
    expect(
      scoreGame(box, false, { ...OFFICIAL_WEIGHTS, turnovers: 0 }).base,
    ).toBe(10);
  });

  it("can weight a component above one", () => {
    expect(
      scoreGame(line({ assistances: 3 }), false, {
        ...OFFICIAL_WEIGHTS,
        assists: 2,
      }).base,
    ).toBe(6);
  });

  it("rounds a fractional weight to tenths rather than carrying a float", () => {
    const box = line({ points: 7 });
    const half = { ...OFFICIAL_WEIGHTS, points: 0.5 };
    expect(scoreGame(box, false, half).base).toBe(3.5);
    expect(scoreGame(box, false, half).fantasyTenths).toBe(35);
    // 3.5 × 1.1 = 3.85 → 38.5 tenths → 39, rounded away from zero.
    expect(scoreGame(box, true, half).fantasyTenths).toBe(39);
  });

  it("rounds a negative fraction away from zero too", () => {
    const box = line({ turnovers: 7 });
    const half = { ...OFFICIAL_WEIGHTS, turnovers: -0.5 };
    expect(scoreGame(box, true, half).fantasyTenths).toBe(-39);
  });
});

describe("tenths", () => {
  it("never produces a float for an integer PIR on a win", () => {
    // The whole reason tenths exist: 3 × 1.1 is 3.3000000000000003 in binary
    // floating point, and a season of those in a standings sum is a wrong
    // number on a page.
    for (let pir = -40; pir <= 60; pir += 1) {
      const { fantasyTenths } = scoreGame(line({ points: pir }), true);
      expect(Number.isInteger(fantasyTenths)).toBe(true);
      expect(fantasyTenths).toBe(pir < 0 ? -Math.round(-pir * 11) : Math.round(pir * 11));
    }
  });

  it.each([
    [0, "0.0"],
    [7, "0.7"],
    [33, "3.3"],
    [330, "33.0"],
    [-11, "-1.1"],
    [-5, "-0.5"],
  ])("formats %i tenths as %s", (tenths, expected) => {
    expect(formatTenths(tenths)).toBe(expected);
  });

  it("sums tenths without ever touching a decimal", () => {
    const season = [33, -11, 0, 187, 5];
    expect(sumTenths(season)).toBe(214);
    expect(formatTenths(sumTenths(season))).toBe("21.4");
  });

  it("sums nothing to nothing rather than to NaN", () => {
    expect(sumTenths([])).toBe(0);
    expect(formatTenths(sumTenths([]))).toBe("0.0");
  });
});
