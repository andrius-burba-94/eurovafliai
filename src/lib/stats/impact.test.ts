import { describe, expect, it } from "vitest";

import { formatSignedTenths } from "./scoring";
import { impactForMember, type ImpactLine, type ImpactTransaction } from "./impact";

const trade: ImpactTransaction = {
  id: "tx-1",
  type: "trade",
  fromRound: 2,
  playersIn: { "m-a": ["p-in"], "m-b": ["p-out"] },
  playersOut: { "m-a": ["p-out"], "m-b": ["p-in"] },
};

const lines: ImpactLine[] = [
  { playerId: "p-out", round: 1, fantasyTenths: 142, pir: 12 },
  { playerId: "p-out", round: 2, fantasyTenths: 50, pir: 5 },
  { playerId: "p-in", round: 1, fantasyTenths: 80, pir: 8 },
  { playerId: "p-in", round: 2, fantasyTenths: 7, pir: 1 },
];

describe("impactForMember", () => {
  it("ignores nights before from_round and subtracts out from in", () => {
    const [deal] = impactForMember("m-a", [trade], lines);
    expect(deal).toMatchObject({
      inTenths: 7,
      outTenths: 50,
      deltaTenths: -43,
      inPir: 1,
      outPir: 5,
      deltaPir: -4,
    });
    expect(deal?.byRound).toEqual([
      {
        round: 2,
        inTenths: 7,
        outTenths: 50,
        deltaTenths: -43,
        inPir: 1,
        outPir: 5,
        deltaPir: -4,
      },
    ]);
  });

  it("mirrors the other side of a 1-for-1", () => {
    const [deal] = impactForMember("m-b", [trade], lines);
    expect(deal?.deltaTenths).toBe(43);
    expect(deal?.inTenths).toBe(50);
    expect(deal?.outTenths).toBe(7);
  });

  it("treats a drop as the counterfactual of keeping them", () => {
    const drop: ImpactTransaction = {
      id: "tx-drop",
      type: "drop",
      fromRound: 2,
      playersIn: {},
      playersOut: { "m-a": ["p-out"] },
    };
    const [deal] = impactForMember("m-a", [drop], lines);
    expect(deal?.inTenths).toBe(0);
    expect(deal?.outTenths).toBe(50);
    expect(deal?.deltaTenths).toBe(-50);
  });

  it("treats an add as the signed player's later nights", () => {
    const add: ImpactTransaction = {
      id: "tx-add",
      type: "add",
      fromRound: 2,
      playersIn: { "m-a": ["p-in"] },
      playersOut: {},
    };
    const [deal] = impactForMember("m-a", [add], lines);
    expect(deal?.inTenths).toBe(7);
    expect(deal?.outTenths).toBe(0);
    expect(deal?.deltaTenths).toBe(7);
  });

  it("counts a missing line as 0, not a skipped round", () => {
    const add: ImpactTransaction = {
      id: "tx-dnp",
      type: "add",
      fromRound: 2,
      playersIn: { "m-a": ["ghost"] },
      playersOut: {},
    };
    const withDnp: ImpactLine[] = [
      ...lines,
      { playerId: "ghost", round: 3, fantasyTenths: 10, pir: 2 },
    ];
    const [deal] = impactForMember("m-a", [add], withDnp);
    expect(deal?.deltaTenths).toBe(10);
    expect(deal?.byRound).toEqual([
      {
        round: 3,
        inTenths: 10,
        outTenths: 0,
        deltaTenths: 10,
        inPir: 2,
        outPir: 0,
        deltaPir: 2,
      },
    ]);
  });

  it("skips a deal that does not name this member", () => {
    expect(impactForMember("m-c", [trade], lines)).toEqual([]);
  });

  it("counts both sides raw all season, whoever owns them and wherever they sit", () => {
    // p-in was benched by m-a and later released; p-out went to free agency.
    // The deal is still the two players against each other, round after round.
    const season: ImpactLine[] = [
      ...lines,
      { playerId: "p-out", round: 3, fantasyTenths: 120, pir: 11 },
      { playerId: "p-in", round: 3, fantasyTenths: 91, pir: 9 },
      { playerId: "p-in", round: 9, fantasyTenths: 33, pir: 3 },
    ];
    const [deal] = impactForMember("m-a", [trade], season);
    expect(deal).toMatchObject({
      inTenths: 7 + 91 + 33,
      outTenths: 50 + 120,
      deltaTenths: 7 + 91 + 33 - 50 - 120,
    });
    expect(deal?.byRound.map((row) => row.round)).toEqual([2, 3, 9]);
  });

  it("adds a round's fractional tenths before rounding once", () => {
    const twoIn: ImpactTransaction = {
      id: "tx-2",
      type: "add",
      fromRound: 1,
      playersIn: { "m-a": ["b1", "b2"] },
      playersOut: {},
    };
    const [deal] = impactForMember("m-a", [twoIn], [
      { playerId: "b1", round: 1, fantasyTenths: 93.5, pir: 17 },
      { playerId: "b2", round: 1, fantasyTenths: 38.5, pir: 7 },
    ]);
    expect(deal?.inTenths).toBe(132);
  });
});

describe("formatSignedTenths", () => {
  it("keeps a plus on a gain and a hyphen on a loss", () => {
    expect(formatSignedTenths(37)).toBe("+3.7");
    expect(formatSignedTenths(-43)).toBe("-4.3");
    expect(formatSignedTenths(0)).toBe("+0.0");
  });
});
