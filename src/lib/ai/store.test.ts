import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import { claimWriteup, completeWriteup, failWriteup, readWriteup, STALE_AFTER_MS, type WriteupKey } from "./store";

const NOW = Date.parse("2026-10-09T12:00:00Z");
const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);
const KEY: WriteupKey = { leagueId: "L1", season: "E2026", round: 4, kind: "round_summary", memberId: "" };
const WRITEUP = { headline: "@T1 takes the round", lines: ["@T1 won."], sections: {} };
const USAGE = { inputTokens: 100, outputTokens: 20, thinkingTokens: 0 };

const claim = (pb: ReturnType<typeof fakePb>, over: Partial<Parameters<typeof claimWriteup>[2]> = {}, key = KEY) =>
  claimWriteup(pb.client, key, { inputHash: HASH_A, voice: "analyst", model: "m", promptVersion: "v1", facts: { text: "x" }, now: NOW, ...over });

const fresh = (data: FakeDb = {}) => fakePb({ data: { ai_writeups: [], ...data } });

describe("claimWriteup", () => {
  it("creates a pending row with the member written out as empty", async () => {
    const pb = fresh();
    await expect(claim(pb)).resolves.toMatchObject({ outcome: "claimed" });
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "pending", member: "", attempts: 1, input_hash: HASH_A });
  });

  it("leaves a ready write-up for the same input alone", async () => {
    const pb = fresh();
    const { id } = await claim(pb);
    await completeWriteup(pb.client, id, { writeup: WRITEUP, refs: {}, usage: USAGE, model: "m", now: NOW });
    await expect(claim(pb)).resolves.toEqual({ outcome: "unchanged", id });
    expect(pb.writes.filter((write) => write.startsWith("update"))).toHaveLength(1);
  });

  it("rewrites when the facts change, and keeps the old prose until the new lands", async () => {
    const pb = fresh();
    const { id } = await claim(pb);
    await completeWriteup(pb.client, id, { writeup: WRITEUP, refs: {}, usage: USAGE, model: "m", now: NOW });
    await expect(claim(pb, { inputHash: HASH_B, now: NOW + 1000 })).resolves.toEqual({ outcome: "claimed", id });
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "pending", input_hash: HASH_B, attempts: 1, output: WRITEUP });
  });

  it("calls a fresh pending row busy, and takes over a stale one", async () => {
    const pb = fresh();
    const { id } = await claim(pb);
    await expect(claim(pb, { now: NOW + 60_000 })).resolves.toEqual({ outcome: "busy", id });
    await expect(claim(pb, { now: NOW + STALE_AFTER_MS + 1 })).resolves.toEqual({ outcome: "claimed", id });
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ attempts: 2 });
  });

  it("stops asking after three failures on the same input, unless forced", async () => {
    const pb = fresh();
    let id = "";
    for (let attempt = 0; attempt < 3; attempt += 1) {
      ({ id } = await claim(pb));
      await failWriteup(pb.client, id, "refused by the guard", USAGE);
    }
    await expect(claim(pb)).resolves.toEqual({ outcome: "exhausted", id });
    await expect(claim(pb, { force: true })).resolves.toEqual({ outcome: "claimed", id });
  });

  it("keeps the previous prose when a rewrite fails", async () => {
    const pb = fresh();
    const { id } = await claim(pb);
    await completeWriteup(pb.client, id, { writeup: WRITEUP, refs: {}, usage: USAGE, model: "m", now: NOW });
    await claim(pb, { inputHash: HASH_B });
    await failWriteup(pb.client, id, "x".repeat(900));
    const row = await readWriteup(pb.client, KEY);
    expect(row).toMatchObject({ status: "failed", output: WRITEUP });
    expect(row?.error).toHaveLength(500);
  });

  it("re-reads and decides when another run created the row first", async () => {
    const pb = fakePb({
      data: { ai_writeups: [] },
      hooks: {
        beforeCreate(collection, data) {
          if (collection !== "ai_writeups") return;
          pb.db.ai_writeups!.push({ id: "raced", ...data, status: "pending", claimed_at: "2026-10-09 12:00:00.000Z" });
        },
      },
    });
    await expect(claim(pb)).resolves.toEqual({ outcome: "busy", id: "raced" });
  });

  it("lets a league-wide row and a member's own row live side by side, but not two league-wide rows", async () => {
    const pb = fresh();
    await claim(pb);
    await claim(pb, {}, { ...KEY, memberId: "m1" });
    expect(pb.rows("ai_writeups")).toHaveLength(2);
    await expect(
      pb.client.collection("ai_writeups").create({ league: "L1", season: "E2026", round: 4, kind: "round_summary", member: "" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("refuses a key that could break out of its filter", async () => {
    await expect(claim(fresh(), {}, { ...KEY, leagueId: "L1' || 1=1" })).rejects.toThrow(/malformed key/);
  });
});
