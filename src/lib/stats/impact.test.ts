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
});

describe("formatSignedTenths", () => {
  it("keeps a plus on a gain and a hyphen on a loss", () => {
    expect(formatSignedTenths(37)).toBe("+3.7");
    expect(formatSignedTenths(-43)).toBe("-4.3");
    expect(formatSignedTenths(0)).toBe("+0.0");
  });
});
