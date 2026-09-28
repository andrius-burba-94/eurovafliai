import { describe, expect, it } from "vitest";

import { lineupWeights } from "@/lib/lineups/lineup";

import {
  computeStandings,
  phaseByRound,
  snapshotRowsFrom,
  snapshotsFromStandings,
  tableFromSnapshots,
  type StandingLine,
  type StandingWindow,
} from "./standings";

const windows: StandingWindow[] = [
  { memberId: "m-b", playerId: "p1" },
  { memberId: "m-a", playerId: "p2" },
];

function line(
  over: Partial<StandingLine> & Pick<StandingLine, "playerId">,
): StandingLine {
  return {
    round: 1,
    phase: "RS",
    fantasyTenths: 100,
    ...over,
  };
}

describe("computeStandings", () => {
  it("sums tenths for two members who scored the same round", () => {
    const table = computeStandings(
      windows,
      [
        line({ playerId: "p1", fantasyTenths: 142 }),
        line({ playerId: "p2", fantasyTenths: 80 }),
      ],
      ["RS"],
    );
    expect(table.map((row) => row.memberId)).toEqual(["m-b", "m-a"]);
    expect(table[0]).toMatchObject({
      totalHundredths: 1420,
      byRound: { 1: 1420 },
    });
    expect(table[1].totalHundredths).toBe(800);
  });

  it("counts a missing line as 0, not as a skipped member", () => {
    const table = computeStandings(
      windows,
      [line({ playerId: "p1", fantasyTenths: 50 })],
      ["RS"],
    );
    const empty = table.find((row) => row.memberId === "m-a");
    expect(empty?.totalHundredths).toBe(0);
    expect(empty?.byRound).toEqual({});
  });

  it("drops a PO line when the filter is regular season", () => {
    const table = computeStandings(
      windows,
      [
        line({ playerId: "p1", round: 1, phase: "RS", fantasyTenths: 10 }),
        line({ playerId: "p1", round: 41, phase: "PO", fantasyTenths: 999 }),
        line({ playerId: "p2", round: 1, phase: "RS", fantasyTenths: 20 }),
      ],
      ["RS"],
    );
    expect(table[0]).toMatchObject({ memberId: "m-a", totalHundredths: 200 });
    expect(table[1]).toMatchObject({ memberId: "m-b", totalHundredths: 100 });
    expect(table[1].byRound).not.toHaveProperty("41");
  });

  it("sums tenths without introducing a float", () => {
    const table = computeStandings(
      [{ memberId: "m1", playerId: "p1" }, { memberId: "m1", playerId: "p2" }],
      [
        line({ playerId: "p1", fantasyTenths: 11 }),
        line({ playerId: "p2", fantasyTenths: 21 }),
      ],
      ["RS"],
    );
    expect(table[0].totalHundredths).toBe(320);
  });

  it("breaks a total tie on member id", () => {
    const table = computeStandings(
      [
        { memberId: "m-z", playerId: "pz" },
        { memberId: "m-a", playerId: "pa" },
      ],
      [
        line({ playerId: "pz", fantasyTenths: 100 }),
        line({ playerId: "pa", fantasyTenths: 100 }),
      ],
      ["RS"],
    );
    expect(table.map((row) => row.memberId)).toEqual(["m-a", "m-z"]);
  });

  it("splits a traded player at from_round", () => {
    const table = computeStandings(
      [
        {
          memberId: "m-a",
          playerId: "p1",
          from_round: 1,
          to_round: 2,
          to_date: "closed",
        },
        {
          memberId: "m-b",
          playerId: "p1",
          from_round: 2,
          to_round: 0,
          to_date: "",
        },
      ],
      [
        line({ playerId: "p1", round: 1, fantasyTenths: 100 }),
        line({ playerId: "p1", round: 2, fantasyTenths: 40 }),
      ],
      ["RS"],
    );
    expect(table.find((row) => row.memberId === "m-a")).toMatchObject({
      totalHundredths: 1000,
      byRound: { 1: 1000 },
    });
    expect(table.find((row) => row.memberId === "m-b")).toMatchObject({
      totalHundredths: 400,
      byRound: { 2: 400 },
    });
  });
});

describe("computeStandings with a lineup", () => {
  const weights = lineupWeights([
    {
      memberId: "m1",
      round: 1,
      source: "recorded",
      slots: {
        starters: ["cap", "starter"],
        captain: "cap",
        sixth: [],
        bench: ["bench"],
        inactive: ["sat"],
      },
    },
  ]);
  const squad: StandingWindow[] = [
    { memberId: "m1", playerId: "cap" },
    { memberId: "m1", playerId: "starter" },
    { memberId: "m1", playerId: "bench" },
    { memberId: "m1", playerId: "sat" },
  ];

  it("doubles the captain, halves the bench and drops the inactive", () => {
    const table = computeStandings(
      squad,
      [
        line({ playerId: "cap", fantasyTenths: 200 }),
        line({ playerId: "starter", fantasyTenths: 100 }),
        line({ playerId: "bench", fantasyTenths: 60 }),
        line({ playerId: "sat", fantasyTenths: 999 }),
      ],
      ["RS"],
      weights,
    );
    expect(table[0]).toMatchObject({
      memberId: "m1",
      totalHundredths: 4000 + 1000 + 300,
    });
  });

  it("keeps a halved odd number of tenths exact, in hundredths", () => {
    const table = computeStandings(
      squad,
      [line({ playerId: "bench", fantasyTenths: 33 })],
      ["RS"],
      weights,
    );
    expect(table[0].byRound[1]).toBe(165);
  });

  it("keeps a halved negative night exact too", () => {
    const table = computeStandings(
      squad,
      [line({ playerId: "bench", fantasyTenths: -33 })],
      ["RS"],
      weights,
    );
    expect(table[0].byRound[1]).toBe(-165);
  });

  it("adds two bench halves without rounding either", () => {
    const twoBench = lineupWeights([
      {
        memberId: "m1",
        round: 1,
        source: "recorded",
        slots: {
          starters: [],
          captain: "",
          sixth: [],
          bench: ["b1", "b2"],
          inactive: [],
        },
      },
    ]);
    const table = computeStandings(
      [
        { memberId: "m1", playerId: "b1" },
        { memberId: "m1", playerId: "b2" },
      ],
      [
        line({ playerId: "b1", fantasyTenths: 187 }),
        line({ playerId: "b2", fantasyTenths: 77 }),
      ],
      ["RS"],
      twoBench,
    );
    expect(table[0].byRound[1]).toBe(1320);
  });

  it("scores a round the lineup does not cover at 100%", () => {
    const table = computeStandings(
      squad,
      [line({ playerId: "sat", round: 2, fantasyTenths: 120 })],
      ["RS"],
      weights,
    );
    expect(table[0].byRound[2]).toBe(1200);
  });

  it("is the same table as before lineups when none is passed", () => {
    const lines = [line({ playerId: "cap", fantasyTenths: 200 })];
    expect(computeStandings(squad, lines, ["RS"])[0].totalHundredths).toBe(2000);
  });
});

describe("computeStandings against an official Euroleague Fantasy round", () => {
  const players = {
    tavares: 50,
    bacon: 341,
    francisco: 198,
    dorsey: 319,
    montero: 209,
    clyburn: 110,
    taylor: 187,
    baugh: 90,
    melli: 88,
    diakite: 77,
    reserve1: 140,
    reserve2: 60,
    reserve3: 25,
  } as const;
  const weights = lineupWeights([
    {
      memberId: "m1",
      round: 1,
      source: "recorded",
      slots: {
        starters: ["francisco", "dorsey", "montero", "bacon", "tavares"],
        captain: "francisco",
        sixth: ["clyburn"],
        bench: ["taylor", "baugh", "melli", "diakite"],
        inactive: ["reserve1", "reserve2", "reserve3"],
      },
    },
  ]);

  it("totals 164.60 FPT, the figure the official game printed", () => {
    const table = computeStandings(
      Object.keys(players).map((playerId) => ({ memberId: "m1", playerId })),
      Object.entries(players).map(([playerId, fantasyTenths]) =>
        line({ playerId, fantasyTenths }),
      ),
      ["RS"],
      weights,
    );
    expect(table[0].byRound[1]).toBe(16460);
  });
});

describe("a round that only hundredths can say", () => {
  it("keeps Laurynas Birutis' official 121.15 rather than rounding it to 121.2", () => {
    const players = {
      baldwin: 143, punter: 242, hoard: 200, reuvers: 33, theis: 90,
      shields: 154, shengelia: 33, nebo: 0, bryant: 130, jones: 250,
    };
    const weights = lineupWeights([
      {
        memberId: "m1",
        round: 1,
        source: "recorded",
        slots: {
          starters: ["baldwin", "punter", "hoard", "reuvers", "theis"],
          captain: "baldwin",
          sixth: ["shields"],
          bench: ["shengelia", "nebo", "bryant", "jones"],
          inactive: [],
        },
      },
    ]);
    const table = computeStandings(
      Object.keys(players).map((playerId) => ({ memberId: "m1", playerId })),
      Object.entries(players).map(([playerId, fantasyTenths]) =>
        line({ playerId, fantasyTenths }),
      ),
      ["RS"],
      weights,
    );
    expect(table[0].byRound[1]).toBe(12115);
  });
});

describe("snapshotRowsFrom", () => {
  it("reads hundredths as stored", () => {
    expect(
      snapshotRowsFrom([{ memberId: "m1", totalHundredths: 12115, roundHundredths: 12115 }]),
    ).toEqual([{ memberId: "m1", totalHundredths: 12115, roundHundredths: 12115 }]);
  });

  it("reads a snapshot written in tenths as ×10 until it is recomputed", () => {
    expect(
      snapshotRowsFrom([{ memberId: "m1", totalTenths: 1482, roundTenths: 1482 }]),
    ).toEqual([{ memberId: "m1", totalHundredths: 14820, roundHundredths: 14820 }]);
  });

  it("drops a row that says neither", () => {
    expect(snapshotRowsFrom([{ memberId: "m1" }, "nonsense", null])).toEqual([]);
    expect(snapshotRowsFrom(null)).toEqual([]);
  });
});

describe("snapshots and the phase filter at read time", () => {
  it("lets the page drop PO without a recompute", () => {
    const lines: StandingLine[] = [
      line({ playerId: "p1", round: 1, phase: "RS", fantasyTenths: 10 }),
      line({ playerId: "p1", round: 41, phase: "PO", fantasyTenths: 50 }),
      line({ playerId: "p2", round: 1, phase: "RS", fantasyTenths: 20 }),
    ];
    const full = computeStandings(windows, lines, ["RS", "PI", "PO", "FF"]);
    const snaps = snapshotsFromStandings(full, phaseByRound(lines));
    expect(snaps.map((s) => s.round)).toEqual([1, 41]);

    const rs = tableFromSnapshots(snaps, ["RS"]);
    expect(rs.rounds).toEqual([1]);
    expect(rs.rows[0]).toMatchObject({ memberId: "m-a", totalHundredths: 200 });

    const all = tableFromSnapshots(snaps, ["RS", "PO"]);
    expect(all.rows[0]).toMatchObject({ memberId: "m-b", totalHundredths: 600 });
  });
});
