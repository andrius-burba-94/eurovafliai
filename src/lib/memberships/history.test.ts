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

function row(id: string, type: "add" | "drop", member: string, players: string[], over: Partial<HistoryRow> = {}): HistoryRow {
  return {
    id,
    type,
    from_round: 2,
    members: [member],
    players_in: { [member]: type === "add" ? players : [] },
    players_out: { [member]: type === "drop" ? players : [] },
    note: `Official game, before round 2: ${member} ${id}`,
    date: "2026-09-29 14:07:56.989Z",
    ...over,
  };
}

describe("free-agent exchanges", () => {
  it("shows one event for a drop and an add, preserving the acquired direction", () => {
    expect(groupTransactionHistory([add, drop])).toEqual([{
      rows: [add, drop],
      exchange: { memberId: "ausys", acquiredIds: ["lawson"], releasedIds: ["brooks"] },
    }]);
  });

  it("pairs every drop and add one team made in one sync, at any count, whatever their notes", () => {
    // Production, before round 2: Ausys swapped Brooks for Lawson and Ojeleye for Pons.
    const rows = [
      row("add-pons", "add", "ausys", ["pons"]),
      row("drop-ojeleye", "drop", "ausys", ["ojeleye"]),
      row("add-lawson", "add", "ausys", ["lawson"]),
      row("drop-brooks", "drop", "ausys", ["brooks"]),
    ];
    const events = groupTransactionHistory(rows);
    expect(events).toHaveLength(1);
    expect(events[0]!.rows.map((entry) => entry.id)).toEqual(["add-pons", "drop-ojeleye", "add-lawson", "drop-brooks"]);
    expect(events[0]!.exchange).toEqual({ memberId: "ausys", acquiredIds: ["pons", "lawson"], releasedIds: ["ojeleye", "brooks"] });
  });

  it("keeps two teams' syncs, two rounds and two sittings apart", () => {
    const events = groupTransactionHistory([
      row("a-add", "add", "ausys", ["lawson"]),
      row("a-drop", "drop", "ausys", ["brooks"]),
      row("k-add", "add", "kisiel", ["madar"]),
      row("k-drop", "drop", "kisiel", ["simmons"]),
      row("a-add-3", "add", "ausys", ["pons"], { from_round: 3 }),
      row("a-drop-3", "drop", "ausys", ["ojeleye"], { from_round: 3 }),
      row("a-add-later", "add", "ausys", ["zizic"], { date: "2026-09-29 15:30:00.000Z" }),
    ]);
    expect(events.map((event) => event.rows.map((entry) => entry.id))).toEqual([
      ["a-add", "a-drop"],
      ["k-add", "k-drop"],
      ["a-add-3", "a-drop-3"],
      ["a-add-later"],
    ]);
  });

  it("leaves records it cannot read as one move separate", () => {
    const variants = [
      { ...add, id: "other-team", members: ["other"], players_in: { other: ["lawson"] } },
      { ...add, id: "other-round", from_round: 3 },
      { ...add, id: "later", date: "2026-09-29 14:20:00.000Z" },
      { ...add, id: "no-note", note: "" },
      { ...add, id: "no-date", date: "" },
      { ...add, id: "both-sides", players_out: { ausys: ["brooks"] } },
      { ...add, id: "re-signed", players_in: { ausys: ["brooks"] } },
    ];
    for (const variant of variants) {
      expect(groupTransactionHistory([variant, drop]).map((event) => event.rows)).toEqual([[variant], [drop]]);
    }
  });

  it("does not group adds or drops alone", () => {
    const anotherAdd = { ...add, id: "second-add", players_in: { ausys: ["pons"] } };
    expect(groupTransactionHistory([add, anotherAdd]).map((event) => event.rows)).toEqual([[add], [anotherAdd]]);
  });
});

describe("swaps between two teams", () => {
  it("reads two teams dropping the player the other added as one trade", () => {
    const rows = [
      row("k-add", "add", "kisiel", ["brooks"], { date: "2026-09-29 14:08:10.000Z" }),
      row("a-add", "add", "ausys", ["madar"], { date: "2026-09-29 14:08:00.000Z" }),
      row("k-drop", "drop", "kisiel", ["madar"]),
      row("a-drop", "drop", "ausys", ["brooks"]),
    ];
    const events = groupTransactionHistory(rows);
    expect(events).toHaveLength(1);
    expect(events[0]!.exchange).toBeUndefined();
    expect(events[0]!.swap).toEqual({ a: "kisiel", b: "ausys", aSent: ["madar"], bSent: ["brooks"] });
    expect(events[0]!.rows.map((entry) => entry.id)).toEqual(["k-add", "a-add", "k-drop", "a-drop"]);
  });

  it("is not a swap when only one way moved, or the moves are rounds apart", () => {
    const oneWay = groupTransactionHistory([
      row("k-add", "add", "kisiel", ["brooks"]),
      row("a-drop", "drop", "ausys", ["brooks"]),
    ]);
    expect(oneWay.map((event) => event.rows.length)).toEqual([1, 1]);

    const apart = groupTransactionHistory([
      row("k-add", "add", "kisiel", ["brooks"], { from_round: 3 }),
      row("a-add", "add", "ausys", ["madar"]),
      row("k-drop", "drop", "kisiel", ["madar"]),
      row("a-drop", "drop", "ausys", ["brooks"]),
    ]);
    expect(apart.some((event) => event.swap)).toBe(false);
  });
});
