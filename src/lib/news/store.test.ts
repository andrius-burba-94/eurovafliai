import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import type { NewsPlan } from "./items";
import {
  applyNewsPlan,
  attachSlug,
  readStoredNews,
  spendItemsFor,
} from "./store";

const row = (over: Record<string, unknown> = {}) => ({
  source: "rotowire",
  source_key: "cordi|2026-09-10|continues recover to",
  slug: "cordi",
  player: "p1",
  name: "Isaia Cordinier",
  club_name: "Anadolu Efes Istanbul",
  position: "G",
  body_part: "Knee",
  headline: "Continues to recover",
  url: "https://www.rotowire.com/euro/player/cordi",
  published: "2026-09-10",
  status: "injured",
  applied: true,
  ...over,
});

const emptyPlan = (over: Partial<NewsPlan> = {}): NewsPlan => ({
  creates: [],
  updates: [],
  unchanged: 0,
  statusChanges: [],
  unmatched: [],
  ...over,
});

const db = (over: FakeDb = {}): FakeDb => ({
  players: [
    { id: "p1", name: "Cordinier, Isaia", status: "active" },
    { id: "p2", name: "Musa, Džanan", status: "active" },
  ],
  player_news: [],
  ...over,
});

describe("applyNewsPlan", () => {
  it("stores items first and flags players last", async () => {
    const pb = fakePb({ data: db() });

    const applied = await applyNewsPlan(
      pb.client,
      emptyPlan({
        creates: [row() as never],
        statusChanges: [
          {
            playerId: "p1",
            playerName: "Cordinier, Isaia",
            from: "active",
            to: "injured",
            sourceKey: "cordi|2026-09-10|continues recover to",
            headline: "Continues to recover",
          },
        ],
      }),
    );

    expect(applied).toMatchObject({ created: 1, flagged: 1, failures: [] });
    // Order is the failure-recovery story: an item stored without its flag is
    // applied by the next pass; a flag without its item has no reason on record.
    expect(pb.writes).toEqual(["create player_news", "update players:p1"]);
    expect(pb.rows("players")[0].status).toBe("injured");
  });

  it("treats losing the create race as the outcome it wanted", async () => {
    const pb = fakePb({ data: db({ player_news: [{ id: "n1", ...row() }] }) });

    const applied = await applyNewsPlan(
      pb.client,
      emptyPlan({ creates: [row() as never] }),
    );

    expect(applied).toMatchObject({ created: 0, unchanged: 1, failures: [] });
    expect(pb.rows("player_news")).toHaveLength(1);
  });

  it("reports a write it could not make rather than throwing the pass away", async () => {
    const pb = fakePb({
      data: db(),
      hooks: {
        beforeCreate(collection) {
          if (collection === "player_news") throw new Error("disk is full");
        },
      },
    });

    const applied = await applyNewsPlan(
      pb.client,
      emptyPlan({ creates: [row() as never, row({ source_key: "b" }) as never] }),
    );

    expect(applied.created).toBe(0);
    expect(applied.failures).toHaveLength(2);
    expect(applied.failures[0]).toContain("disk is full");
  });
});

describe("readStoredNews", () => {
  it("reads one source's items, newest first", async () => {
    const pb = fakePb({
      data: db({
        player_news: [
          { id: "n1", ...row({ published: "2026-09-01" }) },
          { id: "n2", ...row({ source_key: "b", published: "2026-09-12" }) },
        ],
      }),
    });

    const items = await readStoredNews(pb.client);
    expect(items.map((item) => item.id)).toEqual(["n2", "n1"]);
  });
});

describe("attachSlug", () => {
  it("attaches every item under one slug, past and future", async () => {
    const pb = fakePb({
      data: db({
        player_news: [
          { id: "n1", ...row({ player: "", applied: false }) },
          { id: "n2", ...row({ source_key: "b", player: "", applied: false }) },
          { id: "n3", ...row({ slug: "other", player: "", source_key: "c" }) },
        ],
      }),
    });

    expect(await attachSlug(pb.client, "cordi", "p1")).toBe(2);
    expect(pb.rows("player_news").map((item) => item.player)).toEqual([
      "p1",
      "p1",
      "",
    ]);
    // Deliberately not applied: mapping a name is a statement about identity,
    // and the next pass decides the status under its own rules.
    expect(pb.rows("player_news")[0].applied).toBe(false);
  });
});

describe("spendItemsFor", () => {
  it("spends the items that could re-flag a player who is fit again", async () => {
    const pb = fakePb({
      data: db({
        player_news: [
          { id: "n1", ...row({ applied: false }) },
          { id: "n2", ...row({ source_key: "b", applied: true }) },
          { id: "n3", ...row({ source_key: "c", player: "p2", applied: false }) },
        ],
      }),
    });

    expect(await spendItemsFor(pb.client, "p1")).toBe(1);
    expect(pb.rows("player_news").map((item) => item.applied)).toEqual([
      true,
      true,
      false,
    ]);
  });
});
