import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import { deleteSheet, readMatchablePool, readSheet, saveSheet } from "./store";

/**
 * The cheat sheet's PocketBase half, against the strict fake.
 *
 * The fake enforces `unique(member)`, which is what gives the race test its
 * meaning: a fake that stored two sheets for one member would let "a lost
 * create falls back to an update" pass while the real outcome was a duplicate.
 */

const MEMBER = "member_1";

describe("readSheet", () => {
  it("returns null for a member who has never written one", async () => {
    const { client } = fakePb({ data: { cheat_sheets: [] } });
    expect(await readSheet(client, MEMBER)).toBeNull();
  });

  it("validates the JSON columns rather than trusting them", async () => {
    const { client } = fakePb({
      data: {
        cheat_sheets: [
          {
            id: "s1",
            member: MEMBER,
            // A hand-edited row: non-strings and empties in the ranking, and
            // breaks that are out of range, duplicated, or not integers.
            ranking: ["p1", 7, "", null, "p2", "p3"],
            tiers: [2, 2, 0, 3, 99, 1.5, "1"],
            source: "manual",
          },
        ],
      },
    });

    const sheet = await readSheet(client, MEMBER);
    expect(sheet).toEqual({
      id: "s1",
      ranking: ["p1", "p2", "p3"],
      tiers: [2],
      source: "manual",
    });
  });

  it("treats a ranking that is not an array as no ranking", async () => {
    const { client } = fakePb({
      data: {
        cheat_sheets: [
          { id: "s1", member: MEMBER, ranking: { nope: true }, tiers: null },
        ],
      },
    });
    const sheet = await readSheet(client, MEMBER);
    expect(sheet?.ranking).toEqual([]);
    expect(sheet?.tiers).toEqual([]);
    // Anything but the literal "manual" is a CSV sheet.
    expect(sheet?.source).toBe("csv");
  });
});

describe("saveSheet", () => {
  it("creates the first time and updates after that", async () => {
    const fake = fakePb({ data: { cheat_sheets: [] } });

    await saveSheet(fake.client, MEMBER, { ranking: ["p1"], tiers: [] }, "csv");
    await saveSheet(
      fake.client,
      MEMBER,
      { ranking: ["p2", "p1"], tiers: [1] },
      "manual",
    );

    expect(fake.rows("cheat_sheets")).toHaveLength(1);
    expect(fake.writes).toEqual([
      "create cheat_sheets",
      "update cheat_sheets:cheat_sheets_1",
    ]);
    expect(await readSheet(fake.client, MEMBER)).toMatchObject({
      ranking: ["p2", "p1"],
      tiers: [1],
      source: "manual",
    });
  });

  it("loses the create race to the index and updates the row that won", async () => {
    let raced = false;
    const fake = fakePb({
      data: { cheat_sheets: [] },
      hooks: {
        beforeCreate(collection, data) {
          // Somebody else's save lands between our read and our write.
          if (collection === "cheat_sheets" && !raced) {
            raced = true;
            fake.rows("cheat_sheets").push({
              id: "theirs",
              member: data.member as string,
              ranking: ["other"],
              tiers: [],
              source: "csv",
            });
          }
        },
      },
    });

    await saveSheet(fake.client, MEMBER, { ranking: ["mine"], tiers: [] }, "csv");

    expect(fake.rows("cheat_sheets")).toHaveLength(1);
    expect(await readSheet(fake.client, MEMBER)).toMatchObject({
      id: "theirs",
      ranking: ["mine"],
    });
  });

  it("rethrows anything that is not the index refusing", async () => {
    const fake = fakePb({
      data: { cheat_sheets: [] },
      hooks: {
        beforeCreate() {
          throw new Error("disk full");
        },
      },
    });
    await expect(
      saveSheet(fake.client, MEMBER, { ranking: [], tiers: [] }, "csv"),
    ).rejects.toThrow("disk full");
  });
});

describe("deleteSheet", () => {
  it("removes the sheet, and is a no-op for a member without one", async () => {
    const fake = fakePb({
      data: {
        cheat_sheets: [{ id: "s1", member: MEMBER, ranking: [], tiers: [] }],
      },
    });
    await deleteSheet(fake.client, MEMBER);
    await deleteSheet(fake.client, MEMBER);
    expect(fake.rows("cheat_sheets")).toEqual([]);
    expect(fake.writes).toEqual(["delete cheat_sheets:s1"]);
  });
});

describe("readMatchablePool", () => {
  it("offers only the players the room would, in the matcher's shape", async () => {
    const { client } = fakePb({
      data: {
        players: [
          {
            id: "p1",
            name: "Vezenkov, Sasha",
            name_normalized: "sasha vezenkov",
            club_code: "OLY",
            position: "F",
            status: "active",
          },
          {
            id: "p2",
            name: "Gone, Player",
            name_normalized: "gone player",
            club_code: "OLY",
            position: "G",
            status: "left",
          },
          {
            id: "p3",
            name: "Anon, Player",
            club_code: "ZAL",
            position: "C",
            status: "active",
          },
        ],
      },
    });

    const pool = await readMatchablePool(client);
    expect(pool.map((player) => player.id)).toEqual(["p3", "p1"]);
    expect(pool[1]).toEqual({
      id: "p1",
      name: "Vezenkov, Sasha",
      normalized: "sasha vezenkov",
      club: "OLY",
      position: "F",
    });
    // A row with no normalized name yields "" rather than undefined.
    expect(pool[0]?.normalized).toBe("");
  });
});
