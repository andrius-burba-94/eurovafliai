import { describe, expect, it } from "vitest";

import { gameScores } from "./game-tile";

describe("gameScores", () => {
  it("shows nothing before tip-off", () => {
    expect(gameScores({ snapshot: undefined, played: false, localScore: 0, roadScore: 0 })).toEqual({ home: null, away: null });
  });

  it("takes the live feed while there is one", () => {
    expect(gameScores({ snapshot: { localScore: 44, roadScore: 40 }, played: false, localScore: 0, roadScore: 0 })).toEqual({ home: 44, away: 40 });
  });

  it("falls back to the stored result once the game is played", () => {
    expect(gameScores({ snapshot: undefined, played: true, localScore: 81, roadScore: 77 })).toEqual({ home: 81, away: 77 });
  });
});
