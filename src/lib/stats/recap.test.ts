import { describe, expect, it } from "vitest";

import type { ImpactLine, ImpactTransaction } from "./impact";
import { recapForRound } from "./recap";
import type { SnapshotRow } from "./standings";

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

const round2Table: SnapshotRow[] = [
  { memberId: "m-a", totalTenths: 149, roundTenths: 7 },
  { memberId: "m-b", totalTenths: 130, roundTenths: 50 },
];

const windowsAfterTrade = [
  {
    memberId: "m-a",
    playerId: "p-out",
    from_round: 1,
    to_round: 2,
    to_date: "closed",
  },
  {
    memberId: "m-b",
    playerId: "p-in",
    from_round: 1,
    to_round: 2,
    to_date: "closed",
  },
  {
    memberId: "m-a",
    playerId: "p-in",
    from_round: 2,
    to_round: 0,
    to_date: "",
  },
  {
    memberId: "m-b",
    playerId: "p-out",
    from_round: 2,
    to_round: 0,
    to_date: "",
  },
];

describe("recapForRound", () => {
  it("ranks this round's tenths, not season-to-date", () => {
    const recap = recapForRound(2, round2Table, [], [], []);
    expect(recap.rows.map((row) => row.memberId)).toEqual(["m-b", "m-a"]);
    expect(recap.rows[0]?.tenths).toBe(50);
    expect(recap.rows[1]?.tenths).toBe(7);
  });

  it("breaks a round-tenths tie on memberId", () => {
    const recap = recapForRound(
      1,
      [
        { memberId: "m-z", totalTenths: 10, roundTenths: 10 },
        { memberId: "m-a", totalTenths: 10, roundTenths: 10 },
      ],
      [],
      [],
      [],
    );
    expect(recap.rows.map((row) => row.memberId)).toEqual(["m-a", "m-z"]);
  });

  it("names a traded-in player as the best night", () => {
    const recap = recapForRound(
      2,
      round2Table,
      windowsAfterTrade,
      lines,
      [trade],
    );
    expect(recap.bestNight).toEqual({
      playerId: "p-out",
      memberId: "m-b",
      fantasyTenths: 50,
    });
  });

  it("does not credit the previous owner after the exclusive close", () => {
    const recap = recapForRound(
      2,
      round2Table,
      windowsAfterTrade,
      lines,
      [trade],
    );
    expect(recap.bestNight?.memberId).not.toBe("m-a");
  });

  it("treats a missing line as 0, so a scored night still wins", () => {
    const recap = recapForRound(
      2,
      round2Table,
      windowsAfterTrade,
      lines.filter((line) => line.playerId !== "p-in" || line.round !== 2),
      [],
    );
    expect(recap.bestNight).toEqual({
      playerId: "p-out",
      memberId: "m-b",
      fantasyTenths: 50,
    });
  });

  it("breaks a best-night tie on playerId", () => {
    const recap = recapForRound(
      1,
      [],
      [
        { memberId: "m-a", playerId: "p-z", from_round: 1, to_round: 0 },
        { memberId: "m-b", playerId: "p-a", from_round: 1, to_round: 0 },
      ],
      [
        { playerId: "p-z", round: 1, fantasyTenths: 10, pir: 1 },
        { playerId: "p-a", round: 1, fantasyTenths: 10, pir: 1 },
      ],
      [],
    );
    expect(recap.bestNight?.playerId).toBe("p-a");
  });

  it("picks the side of a 1-for-1 that gained this round", () => {
    const recap = recapForRound(
      2,
      round2Table,
      windowsAfterTrade,
      lines,
      [trade],
    );
    expect(recap.biggestSwing).toMatchObject({
      transactionId: "tx-1",
      type: "trade",
      fromRound: 2,
      memberId: "m-b",
      counterpartId: "m-a",
      deltaTenths: 43,
    });
  });

  it("ignores a deal whose from_round is after this night", () => {
    const recap = recapForRound(1, round2Table, windowsAfterTrade, lines, [
      trade,
    ]);
    expect(recap.biggestSwing).toBeNull();
  });

  it("includes an add as a covering deal", () => {
    const add: ImpactTransaction = {
      id: "tx-add",
      type: "add",
      fromRound: 2,
      playersIn: { "m-a": ["p-in"] },
      playersOut: {},
    };
    const recap = recapForRound(2, [], [], lines, [add]);
    expect(recap.biggestSwing).toMatchObject({
      transactionId: "tx-add",
      type: "add",
      memberId: "m-a",
      deltaTenths: 7,
    });
  });

  it("picks the larger absolute swing when two deals cover the round", () => {
    const drop: ImpactTransaction = {
      id: "tx-drop",
      type: "drop",
      fromRound: 2,
      playersIn: {},
      playersOut: { "m-a": ["p-out"] },
    };
    const recap = recapForRound(2, [], [], lines, [trade, drop]);
    expect(recap.biggestSwing?.transactionId).toBe("tx-drop");
    expect(recap.biggestSwing?.deltaTenths).toBe(-50);
  });

  it("returns empty rows and null highlights with no input", () => {
    const recap = recapForRound(3, [], [], [], []);
    expect(recap).toEqual({
      round: 3,
      rows: [],
      bestNight: null,
      biggestSwing: null,
    });
  });
});
