import { describe, expect, it } from "vitest";

import { lineupWeights } from "@/lib/lineups/lineup";

import { provisionalRanks } from "./rank";

describe("provisionalRanks", () => {
  const weights = lineupWeights([{ memberId: "A", round: 2, source: "recorded", slots: {
    starters: ["p1", "p2", "p3", "p4", "p5"], captain: "p1", sixth: [], bench: ["p6"], inactive: [],
  } }]);
  const input = {
    memberIds: ["A", "B"],
    baseTotals: { A: 10000, B: 11000 },
    memberships: [
      { member: "A", player: "p1", from_round: 1 },
      { member: "A", player: "p6", from_round: 1 },
      { member: "B", player: "p7", from_round: 1 },
    ],
    round: 2,
    weights,
  };

  it("adds live captain and bench scores in hundredths", () => {
    const rows = provisionalRanks({ ...input, finalLines: [], liveLines: [
      { playerId: "p1", gameCode: 20, fantasyTenths: 200 },
      { playerId: "p6", gameCode: 20, fantasyTenths: 187 },
      { playerId: "p7", gameCode: 20, fantasyTenths: 100 },
    ] });
    expect(rows.find((row) => row.memberId === "A")?.roundHundredths).toBe(4935);
    expect(rows[0]?.memberId).toBe("A");
  });

  it("uses finished-game rows instead of counting a provisional game twice", () => {
    const rows = provisionalRanks({ ...input,
      finalLines: [{ playerId: "p1", gameCode: 20, fantasyTenths: 220 }],
      liveLines: [{ playerId: "p1", gameCode: 20, fantasyTenths: 200 }],
    });
    expect(rows.find((row) => row.memberId === "A")?.roundHundredths).toBe(4400);
  });

  it("keeps the previous final table when neither feed has a score", () => {
    const rows = provisionalRanks({ ...input, finalLines: [], liveLines: [] });
    expect(rows.map((row) => row.totalHundredths)).toEqual([11000, 10000]);
  });
});
