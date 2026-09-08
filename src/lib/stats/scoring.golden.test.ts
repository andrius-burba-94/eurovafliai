import { describe, expect, it } from "vitest";

import golden from "./fixtures/e2025-boxscores.json";
import {
  type BoxScore,
  OFFICIAL_WEIGHTS,
  OFFICIAL_WIN_BONUS,
  formatTenths,
  scoreGame,
} from "./scoring";

/**
 * The golden test: our PIR against the Euroleague's own.
 *
 * `stats.valuation` in the box-score feed **is** PIR, so this suite is not
 * checking that the code matches my reading of the rulebook — it is checking
 * that our arithmetic matches theirs, player by player, on games that really
 * happened. 2026-27 has not tipped off (E2026 game 1 is 2026-09-24), so last
 * season is the only real data there is, and it is enough.
 *
 * If a row here ever fails, the feed changed or the rulebook did. Re-verify
 * with `npm run stats:golden` and read docs/research/euroleague-api.md before
 * changing `scoreGame` to make it pass.
 */
type GoldenRow = {
  personCode: string;
  name: string;
  club: string;
  won: boolean;
  valuation: number;
  stats: BoxScore;
};
type GoldenGame = {
  gameCode: number;
  round: number;
  phase: string;
  localClub: string;
  localScore: number;
  roadClub: string;
  roadScore: number;
  rows: GoldenRow[];
};

const games = golden.games as GoldenGame[];
const rows = games.flatMap((game) =>
  game.rows.map((row) => ({ ...row, game })),
);

describe("scoreGame against real E2025 box scores", () => {
  it("has a fixture big enough to be evidence", () => {
    // Guards the fixture itself. A regeneration that quietly fetched one game
    // would leave every assertion below passing against almost nothing — the
    // same trap as a screenshot that asserts nothing about its own content.
    expect(games).toHaveLength(7);
    expect(rows).toHaveLength(168);
    expect(new Set(games.map((game) => game.round)).size).toBeGreaterThan(4);
  });

  it("reproduces the published PIR for every player in every game", () => {
    const mismatches = rows
      .filter((row) => scoreGame(row.stats, row.won).base !== row.valuation)
      .map(
        (row) =>
          `${row.name} (${row.club}, game ${row.game.gameCode}): ours ${
            scoreGame(row.stats, row.won).base
          }, theirs ${row.valuation}`,
      );
    expect(mismatches).toEqual([]);
  });

  it("covers the edges it needs to cover, in real data", () => {
    // The blueprint's open question 3 is about negative PIR on a win. If the
    // fixture had none, the decision below would be untested by construction.
    const negatives = rows.filter((row) => row.valuation < 0);
    expect(negatives.length).toBeGreaterThanOrEqual(10);
    expect(negatives.filter((row) => row.won).length).toBeGreaterThanOrEqual(5);
    // A did-not-play line is all zeros, and it is not an error.
    expect(
      rows.some((row) => row.stats.timePlayed === 0 && row.valuation === 0),
    ).toBe(true);
  });

  it("applies the win bonus to exactly the winning club", () => {
    for (const game of games) {
      const winner =
        game.localScore > game.roadScore ? game.localClub : game.roadClub;
      // No Euroleague game ends level — overtime is played until it does not.
      expect(game.localScore).not.toBe(game.roadScore);
      for (const row of game.rows) {
        expect(row.won).toBe(row.club === winner);
      }
    }
  });

  it("multiplies a winner's PIR and leaves a loser's alone", () => {
    for (const row of rows) {
      const { base, fantasyTenths } = scoreGame(row.stats, row.won);
      expect(fantasyTenths).toBe(
        row.won
          ? Math.sign(base) * Math.round(Math.abs(base * OFFICIAL_WIN_BONUS * 10))
          : base * 10,
      );
    }
  });

  it("never produces a float, on any real row", () => {
    for (const row of rows) {
      expect(Number.isInteger(scoreGame(row.stats, row.won).fantasyTenths)).toBe(
        true,
      );
    }
  });

  it("agrees with the official weights being the identity for PIR", () => {
    // If somebody edits OFFICIAL_WEIGHTS, the golden rows above break — but
    // this states the reason rather than leaving it to be inferred from 168
    // failures.
    for (const weight of Object.values(OFFICIAL_WEIGHTS)) {
      expect(Math.abs(weight)).toBe(1);
    }
  });

  it("prints the best and worst real lines the way a human reads them", () => {
    const best = rows.reduce((top, row) =>
      row.valuation > top.valuation ? row : top,
    );
    const worst = rows.reduce((low, row) =>
      row.valuation < low.valuation ? row : low,
    );
    // Not a snapshot: these are facts about games that were played, and the
    // point of asserting them is that the formatting of a real extreme is
    // exercised rather than only that of a fixture I invented.
    expect(formatTenths(scoreGame(best.stats, best.won).fantasyTenths)).toMatch(
      /^\d+\.\d$/,
    );
    expect(
      formatTenths(scoreGame(worst.stats, worst.won).fantasyTenths),
    ).toMatch(/^-?\d+\.\d$/);
    expect(worst.valuation).toBeLessThan(0);
  });
});
