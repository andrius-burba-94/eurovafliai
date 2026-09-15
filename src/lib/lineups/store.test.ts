import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import type { LineupSlots } from "./lineup";
import {
  readLineupWeights,
  readRecordedLineups,
  readSquadForRound,
  slotsFrom,
  writeLineup,
} from "./store";

const SLOTS: LineupSlots = {
  starters: ["cap", "s2"],
  captain: "cap",
  sixth: ["six"],
  bench: ["benched"],
  inactive: ["sat"],
};

function db(over: Partial<FakeDb> = {}): FakeDb {
  return {
    round_lineups: [],
    roster_memberships: [],
    players: [],
    ...over,
  };
}

describe("slotsFrom", () => {
  it("reads a stored payload", () => {
    expect(slotsFrom({ ...SLOTS })).toEqual(SLOTS);
  });

  it("refuses a payload with no captain or no starters rather than throwing", () => {
    expect(slotsFrom({ ...SLOTS, captain: "" })).toBeNull();
    expect(slotsFrom({ ...SLOTS, starters: [] })).toBeNull();
    expect(slotsFrom(null)).toBeNull();
    expect(slotsFrom("nonsense")).toBeNull();
  });

  it("drops anything in the payload that is not an id", () => {
    const read = slotsFrom({ ...SLOTS, bench: ["benched", 7, null] });
    expect(read?.bench).toEqual(["benched"]);
  });
});

describe("writeLineup", () => {
  it("creates once and then updates the same round", async () => {
    const pb = fakePb({ data: db() });
    const write = {
      leagueId: "lg",
      memberId: "m1",
      season: "E2026",
      round: 3,
      slots: SLOTS,
      recordedBy: "u1",
    };

    expect(await writeLineup(pb.client, write)).toBe("created");
    expect(await writeLineup(pb.client, write)).toBe("updated");
    expect(pb.rows("round_lineups")).toHaveLength(1);
    expect(pb.rows("round_lineups")[0]).toMatchObject({
      source: "recorded",
      recorded_by: "u1",
      round: 3,
    });
  });

  it("does not collide with another round or another member", async () => {
    const pb = fakePb({ data: db() });
    const base = {
      leagueId: "lg",
      season: "E2026",
      slots: SLOTS,
      recordedBy: "u1",
    };
    await writeLineup(pb.client, { ...base, memberId: "m1", round: 3 });
    await writeLineup(pb.client, { ...base, memberId: "m1", round: 4 });
    await writeLineup(pb.client, { ...base, memberId: "m2", round: 3 });
    expect(pb.rows("round_lineups")).toHaveLength(3);
  });

  it("recovers when somebody else created the row first", async () => {
    const pb = fakePb({
      data: db(),
      hooks: {
        beforeCreate(collection, data) {
          if (collection !== "round_lineups") return;
          if (pb.rows("round_lineups").length > 0) return;
          pb.rows("round_lineups").push({
            id: "raced",
            ...(data as Record<string, unknown>),
          });
        },
      },
    });
    expect(
      await writeLineup(pb.client, {
        leagueId: "lg",
        memberId: "m1",
        season: "E2026",
        round: 3,
        slots: SLOTS,
        recordedBy: "u1",
      }),
    ).toBe("updated");
    expect(pb.rows("round_lineups")).toHaveLength(1);
  });
});

describe("readRecordedLineups", () => {
  it("skips a row whose payload cannot be read", async () => {
    const pb = fakePb({
      data: db({
        round_lineups: [
          {
            id: "a",
            league: "lg",
            member: "m1",
            season: "E2026",
            round: 1,
            slots: { ...SLOTS },
          },
          {
            id: "b",
            league: "lg",
            member: "m1",
            season: "E2026",
            round: 2,
            slots: { starters: [] },
          },
        ],
      }),
    });
    const rows = await readRecordedLineups(pb.client, "lg", "E2026");
    expect(rows.map((row) => row.round)).toEqual([1]);
  });
});

describe("readSquadForRound", () => {
  const memberships = [
    {
      id: "w1",
      league: "lg",
      member: "m1",
      player: "kept",
      from_round: 1,
      to_round: 0,
      to_date: "",
    },
    {
      id: "w2",
      league: "lg",
      member: "m1",
      player: "traded-away",
      from_round: 1,
      to_round: 3,
      to_date: "2026-10-01 12:00:00.000Z",
    },
    {
      id: "w3",
      league: "lg",
      member: "m1",
      player: "arrived",
      from_round: 3,
      to_round: 0,
      to_date: "",
    },
  ];

  it("names who was on the roster that round, not who is on it now", async () => {
    const pb = fakePb({ data: db({ roster_memberships: memberships }) });
    expect(
      (await readSquadForRound(pb.client, "lg", "m1", 2)).sort(),
    ).toEqual(["kept", "traded-away"]);
    expect((await readSquadForRound(pb.client, "lg", "m1", 3)).sort()).toEqual([
      "arrived",
      "kept",
    ]);
  });
});

describe("readLineupWeights", () => {
  it("weighs recorded rounds and carries the last one forward", async () => {
    const pb = fakePb({
      data: db({
        round_lineups: [
          {
            id: "a",
            league: "lg",
            member: "m1",
            season: "E2026",
            round: 2,
            slots: { ...SLOTS },
          },
        ],
      }),
    });
    const weights = await readLineupWeights(
      pb.client,
      "lg",
      "E2026",
      [1, 2, 3],
      ["m1"],
    );
    expect(weights.multiplierFor("m1", 1, "cap")).toBe(1);
    expect(weights.multiplierFor("m1", 2, "cap")).toBe(2);
    expect(weights.multiplierFor("m1", 3, "benched")).toBe(0.5);
    expect(weights.sourceFor("m1", 3)).toBe("carried");
  });
});
