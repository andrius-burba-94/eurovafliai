import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import {
  asPbDate,
  applyTransaction,
  clearLeagueMemberships,
  materializeDraftMemberships,
} from "./store";
import type { ApplyPlan } from "./plan";

const FROM = new Date("2026-09-08T12:00:00.000Z");

const picks = [
  { memberId: "m-a", playerId: "p1" },
  { memberId: "m-b", playerId: "p2" },
];

describe("materializeDraftMemberships", () => {
  it("writes one open window per pick", async () => {
    const { client, rows } = fakePb({ data: { roster_memberships: [] } });
    const report = await materializeDraftMemberships(
      client,
      { id: "d1", league: "lg1" },
      picks,
      FROM,
    );
    expect(report).toEqual({ created: 2, skipped: 0 });
    expect(rows("roster_memberships")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          league: "lg1",
          member: "m-a",
          player: "p1",
          from_date: asPbDate(FROM),
          to_date: "",
          from_round: 1,
          to_round: 0,
          acquired_via: "draft",
        }),
        expect.objectContaining({
          league: "lg1",
          member: "m-b",
          player: "p2",
          acquired_via: "draft",
        }),
      ]),
    );
  });

  it("is a no-op when the windows already exist", async () => {
    const { client } = fakePb({ data: { roster_memberships: [] } });
    const draft = { id: "d1", league: "lg1" };
    await materializeDraftMemberships(client, draft, picks, FROM);
    const again = await materializeDraftMemberships(client, draft, picks, FROM);
    expect(again).toEqual({ created: 0, skipped: 2 });
  });

  it("resumes after a crash that wrote only some of the rows", async () => {
    const { client, rows } = fakePb({
      data: {
        roster_memberships: [
          {
            id: "already",
            league: "lg1",
            member: "m-a",
            player: "p1",
            from_date: asPbDate(FROM),
            acquired_via: "draft",
          },
        ],
      },
    });
    const report = await materializeDraftMemberships(
      client,
      { id: "d1", league: "lg1" },
      picks,
      FROM,
    );
    expect(report).toEqual({ created: 1, skipped: 1 });
    expect(rows("roster_memberships")).toHaveLength(2);
  });

  it("does not recreate a player whose window is already open on another member", async () => {
    const { client, rows } = fakePb({
      data: {
        roster_memberships: [
          {
            id: "held",
            league: "lg1",
            member: "m-other",
            player: "p1",
            acquired_via: "draft",
          },
        ],
      },
    });
    const report = await materializeDraftMemberships(
      client,
      { id: "d1", league: "lg1" },
      [{ memberId: "m-a", playerId: "p1" }],
      FROM,
    );
    expect(report.skipped).toBe(1);
    expect(rows("roster_memberships")).toHaveLength(1);
  });

  it("loses a unique race by skipping, not throwing", async () => {
    const fake = fakePb({
      data: { roster_memberships: [] },
      hooks: {
        beforeCreate(collection, data) {
          if (collection !== "roster_memberships") return;
          fake.db.roster_memberships.push({
            id: "raced",
            league: data.league as string,
            member: "m-other",
            player: data.player as string,
            acquired_via: "draft",
          });
        },
      },
    });
    const report = await materializeDraftMemberships(
      fake.client,
      { id: "d1", league: "lg1" },
      [{ memberId: "m-a", playerId: "p1" }],
      FROM,
    );
    expect(report).toEqual({ created: 0, skipped: 1 });
  });
});

describe("clearLeagueMemberships", () => {
  it("deletes every window in the league and leaves another league alone", async () => {
    const { client, rows } = fakePb({
      data: {
        roster_memberships: [
          { id: "a", league: "lg1", member: "m-a", player: "p1" },
          { id: "b", league: "lg1", member: "m-b", player: "p2" },
          { id: "c", league: "lg2", member: "m-x", player: "p3" },
        ],
      },
    });
    const removed = await clearLeagueMemberships(client, "lg1");
    expect(removed).toBe(2);
    expect(rows("roster_memberships").map((row) => row.id)).toEqual(["c"]);
  });
});

const tradePlan: ApplyPlan = {
  type: "trade",
  fromRound: 2,
  members: ["m-a", "m-b"],
  playersOut: { "m-a": ["p1"], "m-b": ["p2"] },
  playersIn: { "m-a": ["p2"], "m-b": ["p1"] },
  closes: [
    { membershipId: "rm-a", toRound: 2 },
    { membershipId: "rm-b", toRound: 2 },
  ],
  opens: [
    { member: "m-b", player: "p1", fromRound: 2, acquired_via: "trade" },
    { member: "m-a", player: "p2", fromRound: 2, acquired_via: "trade" },
  ],
};

describe("applyTransaction", () => {
  it("closes outgoing windows and opens incoming ones after writing the intent", async () => {
    const { client, rows, writes } = fakePb({
      data: {
        roster_memberships: [
          {
            id: "rm-a",
            league: "lg1",
            member: "m-a",
            player: "p1",
            to_date: "",
            from_round: 1,
            to_round: 0,
          },
          {
            id: "rm-b",
            league: "lg1",
            member: "m-b",
            player: "p2",
            to_date: "",
            from_round: 1,
            to_round: 0,
          },
        ],
        transactions: [],
        chat_messages: [],
      },
    });
    const report = await applyTransaction(
      client,
      "lg1",
      tradePlan,
      FROM,
      "A traded p1 to B for p2.",
      "",
    );
    expect(report.created).toBe(true);
    expect(writes[0]).toBe("create transactions");
    const closed = rows("roster_memberships").filter(
      (row) => row.id === "rm-a" || row.id === "rm-b",
    );
    expect(closed.every((row) => row.to_round === 2)).toBe(true);
    expect(
      rows("roster_memberships").filter((row) => row.to_date === ""),
    ).toHaveLength(2);
    expect(rows("chat_messages")).toHaveLength(1);
  });

  it("resumes from the stored intent instead of writing a second transaction", async () => {
    const { client, rows } = fakePb({
      data: {
        roster_memberships: [
          {
            id: "rm-a",
            league: "lg1",
            member: "m-a",
            player: "p1",
            to_date: "",
            from_round: 1,
          },
          {
            id: "rm-b",
            league: "lg1",
            member: "m-b",
            player: "p2",
            to_date: "",
            from_round: 1,
          },
        ],
        transactions: [],
        chat_messages: [],
      },
    });
    await applyTransaction(client, "lg1", tradePlan, FROM, "Done.", "");
    const again = await applyTransaction(client, "lg1", tradePlan, FROM, "Done.", "");
    expect(again.created).toBe(false);
    expect(rows("transactions")).toHaveLength(1);
    expect(
      rows("roster_memberships").filter((row) => row.acquired_via === "trade"),
    ).toHaveLength(2);
  });
});
