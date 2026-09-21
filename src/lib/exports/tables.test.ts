import { describe, expect, it } from "vitest";

import type { BoardPick } from "@/lib/drafts/types";

import {
  EXPORT_KINDS,
  exportFileName,
  orderTable,
  parseFormat,
  parseKinds,
  poolTable,
  resultsTable,
  rostersTable,
  type ExportPoolPlayer,
} from "./tables";

function pick(over: Partial<BoardPick> & { overallNo: number }): BoardPick {
  return {
    id: `p${over.overallNo}`,
    round: 1,
    slot: 1,
    memberId: "m1",
    memberName: "Andrius",
    playerId: "pl1",
    playerName: "Nunn, Kendrick",
    playerClub: "PAN",
    position: "G",
    isAuto: false,
    ...over,
  };
}

const ORDER = [
  { memberId: "m1", memberName: "Andrius" },
  { memberId: "m2", memberName: "Nerijus" },
];

describe("parseKinds", () => {
  it("reads repeated params and a comma-joined one the same way", () => {
    expect(parseKinds(["results", "pool"])).toEqual(["results", "pool"]);
    expect(parseKinds(["results,pool"])).toEqual(["results", "pool"]);
  });

  it("returns them in a fixed order, so the same ask gives the same file", () => {
    expect(parseKinds(["pool", "results"])).toEqual(["results", "pool"]);
  });

  it("drops unknown kinds instead of failing", () => {
    expect(parseKinds(["results", "salaries"])).toEqual(["results"]);
  });

  it("returns nothing when nothing valid was asked for — the caller answers that", () => {
    expect(parseKinds([])).toEqual([]);
    expect(parseKinds(["", "nonsense"])).toEqual([]);
  });
});

describe("parseFormat", () => {
  it("is CSV unless JSON is named", () => {
    expect(parseFormat("json")).toBe("json");
    expect(parseFormat("csv")).toBe("csv");
    expect(parseFormat(null)).toBe("csv");
    expect(parseFormat("xlsx")).toBe("csv");
  });
});

describe("resultsTable", () => {
  it("sorts by overall number regardless of the order it was handed", () => {
    const table = resultsTable([pick({ overallNo: 2 }), pick({ overallNo: 1 })]);
    expect(table.rows.map((row) => row[0])).toEqual([1, 2]);
  });

  it("writes autodraft as a word, because a spreadsheet shows booleans badly", () => {
    const table = resultsTable([pick({ overallNo: 1, isAuto: true })]);
    expect(table.rows[0]?.at(-1)).toBe("yes");
  });

  it("is a header-only table for a draft with no picks", () => {
    expect(resultsTable([]).rows).toEqual([]);
    expect(resultsTable([]).columns.length).toBeGreaterThan(0);
  });
});

describe("rostersTable", () => {
  it("groups by team in draft order, then by G/F/C", () => {
    const table = rostersTable(
      [
        pick({ overallNo: 1, memberId: "m1", memberName: "Andrius", position: "C", playerName: "Tavares" }),
        pick({ overallNo: 2, memberId: "m2", memberName: "Nerijus", position: "G", playerName: "Shorts" }),
        pick({ overallNo: 3, memberId: "m1", memberName: "Andrius", position: "G", playerName: "Nunn" }),
      ],
      ORDER,
    );
    expect(table.rows.map((row) => [row[0], row[1], row[2]])).toEqual([
      ["Andrius", "G", "Nunn"],
      ["Andrius", "C", "Tavares"],
      ["Nerijus", "G", "Shorts"],
    ]);
  });

  it("breaks a tie within a position by when the pick was made", () => {
    const table = rostersTable(
      [
        pick({ overallNo: 5, position: "G", playerName: "second" }),
        pick({ overallNo: 3, position: "G", playerName: "first" }),
      ],
      ORDER,
    );
    expect(table.rows.map((row) => row[2])).toEqual(["first", "second"]);
  });

  it("emits no rows for a seat that never picked", () => {
    const table = rostersTable([pick({ overallNo: 1, memberId: "m1" })], ORDER);
    expect(table.rows.every((row) => row[0] === "Andrius")).toBe(true);
  });
});

describe("orderTable", () => {
  it("numbers the slots from one", () => {
    expect(orderTable(ORDER).rows).toEqual([
      [1, "Andrius"],
      [2, "Nerijus"],
    ]);
  });
});

describe("poolTable", () => {
  function player(over: Partial<ExportPoolPlayer> = {}): ExportPoolPlayer {
    return {
      name: "Vezenkov, Sasha",
      club: "OLY",
      clubName: "Olympiacos",
      position: "F",
      status: "active",
      takenBy: null,
      takenAt: null,
      averagePir: 221,
      averageGames: 34,
      averageSource: "prev",
      averageFantasy: 198,
      ...over,
    };
  }

  it("writes averages as decimals, out of the stored tenths", () => {
    const row = poolTable([player()], {}).rows[0]!;
    expect(row).toContain("22.1");
    expect(row).toContain("19.8");
  });

  it("leaves an unknown average EMPTY rather than zero", () => {
    const row = poolTable([player({ averagePir: null, averageFantasy: null })], {}).rows[0]!;
    expect(row).not.toContain("0.0");
    expect(row.filter((cell) => cell === null)).toHaveLength(2);
  });

  it("keeps a genuine 0.0 average, which is not the same as unknown", () => {
    const row = poolTable([player({ averagePir: 0 })], {}).rows[0]!;
    expect(row).toContain("0.0");
  });

  it("resolves who took a player into their team name", () => {
    const row = poolTable([player({ takenBy: "m2", takenAt: 7 })], {
      m2: "Nerijus",
    }).rows[0]!;
    expect(row).toContain("Nerijus");
    expect(row).toContain(7);
  });

  it("falls back to the raw id rather than blanking an unknown team", () => {
    const row = poolTable([player({ takenBy: "ghost" })], {}).rows[0]!;
    expect(row).toContain("ghost");
  });
});

describe("exportFileName", () => {
  const day = new Date("2026-09-21T18:30:00.000Z");

  it("slugs the league name and names a single kind", () => {
    expect(exportFileName("EuroVafliai 26-27", ["rosters"], "csv", day)).toBe(
      "eurovafliai-26-27-rosters-2026-09-21.csv",
    );
  });

  it("calls a multi-kind export the draft", () => {
    expect(exportFileName("EuroVafliai 26-27", EXPORT_KINDS, "json", day)).toBe(
      "eurovafliai-26-27-draft-2026-09-21.json",
    );
  });

  it("survives a league named entirely in punctuation", () => {
    expect(exportFileName("!!!", ["order"], "csv", day)).toBe(
      "league-order-2026-09-21.csv",
    );
  });
});
