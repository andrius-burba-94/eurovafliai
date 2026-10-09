import { describe, expect, it } from "vitest";

import { lineupWeights } from "@/lib/lineups/lineup";

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
  { memberId: "m-a", totalHundredths: 149, roundHundredths: 7 },
  { memberId: "m-b", totalHundredths: 130, roundHundredths: 50 },
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
    expect(recap.rows[0]?.hundredths).toBe(50);
    expect(recap.rows[1]?.hundredths).toBe(7);
  });

  it("breaks a round-tenths tie on memberId", () => {
    const recap = recapForRound(
      1,
      [
        { memberId: "m-z", totalHundredths: 10, roundHundredths: 10 },
        { memberId: "m-a", totalHundredths: 10, roundHundredths: 10 },
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

  it("measures a synced drop and add as one exchange, players in minus players out", () => {
    // The trades page and the round write-up both read these two rows as one
    // move; the swing measured the drop alone and the page disagreed with itself.
    const drop: ImpactTransaction = { id: "tx-drop", type: "drop", fromRound: 2, playersIn: {}, playersOut: { "m-a": ["p-out"] } };
    const add: ImpactTransaction = { id: "tx-add", type: "add", fromRound: 2, playersIn: { "m-a": ["p-in"] }, playersOut: {} };
    const recap = recapForRound(2, [], [], lines, [drop, add], undefined, [{ ids: ["tx-drop", "tx-add"], kind: "exchange" }]);
    expect(recap.biggestSwing).toMatchObject({
      transactionId: "tx-drop",
      exchange: true,
      memberId: "m-a",
      deltaTenths: 7 - 50,
      inIds: ["p-in"],
      outIds: ["p-out"],
    });
  });

  it("reads two teams' synced drops and adds as the trade they were", () => {
    const aDrop: ImpactTransaction = { id: "a-drop", type: "drop", fromRound: 2, playersIn: {}, playersOut: { "m-a": ["p-out"] } };
    const bAdd: ImpactTransaction = { id: "b-add", type: "add", fromRound: 2, playersIn: { "m-b": ["p-out"] }, playersOut: {} };
    const bDrop: ImpactTransaction = { id: "b-drop", type: "drop", fromRound: 2, playersIn: {}, playersOut: { "m-b": ["p-in"] } };
    const aAdd: ImpactTransaction = { id: "a-add", type: "add", fromRound: 2, playersIn: { "m-a": ["p-in"] }, playersOut: {} };
    const recap = recapForRound(2, [], [], lines, [aDrop, bAdd, bDrop, aAdd], undefined, [
      { ids: ["a-drop", "b-add", "b-drop", "a-add"], kind: "swap" },
    ]);
    // The same answer as the recorded 1-for-1 above: m-b gained 50 - 7.
    expect(recap.biggestSwing).toMatchObject({ type: "trade", exchange: false, memberId: "m-b", counterpartId: "m-a", deltaTenths: 43 });
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

  it("weighs the best night by the lineup that owned it", () => {
    const weights = lineupWeights([
      {
        memberId: "m-b",
        round: 2,
        source: "recorded",
        slots: {
          starters: ["p-out"],
          captain: "p-out",
          sixth: [],
          bench: [],
          inactive: [],
        },
      },
    ]);
    const recap = recapForRound(
      2,
      round2Table,
      windowsAfterTrade,
      lines,
      [trade],
      weights,
    );
    expect(recap.bestNight).toEqual({
      playerId: "p-out",
      memberId: "m-b",
      fantasyTenths: 100,
    });
  });

  it("does not name a night that scored nothing because they sat", () => {
    const weights = lineupWeights([
      {
        memberId: "m-b",
        round: 2,
        source: "recorded",
        slots: {
          starters: ["someone-else"],
          captain: "someone-else",
          sixth: [],
          bench: [],
          inactive: ["p-out"],
        },
      },
    ]);
    const recap = recapForRound(
      2,
      round2Table,
      windowsAfterTrade,
      lines,
      [trade],
      weights,
    );
    expect(recap.bestNight?.playerId).not.toBe("p-out");
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
