import { describe, expect, it } from "vitest";

import { groupTransactionHistory, type HistoryRow } from "./history";

const note = "Official game: Ausys received Lawson and released Brooks before round 2.";
const drop: HistoryRow = {
  id: "drop",
  type: "drop",
  from_round: 2,
  members: ["ausys"],
  players_in: { ausys: [] },
  players_out: { ausys: ["brooks"] },
  note,
  date: "2026-09-29 14:07:00.000Z",
};
const add: HistoryRow = {
  id: "add",
  type: "add",
  from_round: 2,
  members: ["ausys"],
  players_in: { ausys: ["lawson"] },
  players_out: { ausys: [] },
  note,
  date: "2026-09-29 14:07:01.000Z",
};

describe("historical free-agent exchanges", () => {
  it("shows one event for an exact drop and add, preserving the acquired direction", () => {
    expect(groupTransactionHistory([add, drop])).toEqual([{
      rows: [add, drop],
      exchange: { memberId: "ausys", acquiredId: "lawson", releasedId: "brooks" },
    }]);
  });

  it("leaves unrelated changes separate rather than inventing an exchange", () => {
    const variants = [
      { ...add, id: "other-team", members: ["other"], players_in: { other: ["lawson"] } },
      { ...add, id: "other-round", from_round: 3 },
      { ...add, id: "other-note", note: "Another deal" },
      { ...add, id: "later", date: "2026-09-29 14:20:00.000Z" },
      { ...add, id: "batch", players_in: { ausys: ["lawson", "another"] } },
      { ...add, id: "no-note", note: "" },
    ];
    for (const variant of variants) {
      expect(groupTransactionHistory([variant, drop]).map((event) => event.rows)).toEqual([[variant], [drop]]);
    }
  });

  it("does not guess when the note names more than two records", () => {
    const anotherAdd = { ...add, id: "second-add" };
    expect(groupTransactionHistory([add, drop, anotherAdd]).map((event) => event.rows)).toEqual([[add], [drop], [anotherAdd]]);
  });
});
