import { describe, expect, it } from "vitest";

import {
  computeStandings,
  phaseByRound,
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
      totalTenths: 142,
      byRound: { 1: 142 },
    });
    expect(table[1].totalTenths).toBe(80);
  });

  it("counts a missing line as 0, not as a skipped member", () => {
    const table = computeStandings(
      windows,
      [line({ playerId: "p1", fantasyTenths: 50 })],
      ["RS"],
    );
    const empty = table.find((row) => row.memberId === "m-a");
    expect(empty?.totalTenths).toBe(0);
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
    expect(table[0]).toMatchObject({ memberId: "m-a", totalTenths: 20 });
    expect(table[1]).toMatchObject({ memberId: "m-b", totalTenths: 10 });
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
    expect(table[0].totalTenths).toBe(32);
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
      totalTenths: 100,
      byRound: { 1: 100 },
    });
    expect(table.find((row) => row.memberId === "m-b")).toMatchObject({
      totalTenths: 40,
      byRound: { 2: 40 },
    });
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
    expect(rs.rows[0]).toMatchObject({ memberId: "m-a", totalTenths: 20 });

    const all = tableFromSnapshots(snaps, ["RS", "PO"]);
    expect(all.rows[0]).toMatchObject({ memberId: "m-b", totalTenths: 60 });
  });
});
