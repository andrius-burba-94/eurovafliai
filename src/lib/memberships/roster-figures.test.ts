import { describe, expect, it } from "vitest";

import { rosterFigures } from "./roster-figures";

const lines = [
  { player: "tavares", round: 1, fantasy_pts: 140 },
  { player: "tavares", round: 2, fantasy_pts: 190 },
  { player: "tavares", round: 3, fantasy_pts: 270 },
  { player: "bacon", round: 1, fantasy_pts: 209 },
  { player: "bacon", round: 2, fantasy_pts: 120 },
  { player: "gueye", round: 1, fantasy_pts: 80 },
];

describe("rosterFigures", () => {
  it("takes last from the player's own latest game, not the league's latest round", () => {
    expect(rosterFigures(lines, "bacon", 1)).toEqual({ seasonTenths: 329, games: 2, lastTenths: 120, lastRound: 2 });
    expect(rosterFigures(lines, "tavares", 1)).toMatchObject({ lastTenths: 270, lastRound: 3 });
  });

  it("counts nothing from before the player joined this roster", () => {
    expect(rosterFigures(lines, "gueye", 3)).toEqual({ seasonTenths: 0, games: 0, lastTenths: null, lastRound: null });
    expect(rosterFigures(lines, "tavares", 2)).toEqual({ seasonTenths: 460, games: 2, lastTenths: 270, lastRound: 3 });
  });

  it("reads a missing or zero from_round as the whole season", () => {
    expect(rosterFigures(lines, "bacon", null).games).toBe(2);
    expect(rosterFigures(lines, "bacon", 0).games).toBe(2);
  });

  it("gives a player who has not played a dash, not a zero", () => {
    expect(rosterFigures(lines, "nobody", 1)).toEqual({ seasonTenths: 0, games: 0, lastTenths: null, lastRound: null });
  });
});
