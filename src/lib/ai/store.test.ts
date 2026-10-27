import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import {
  abandonClaim,
  claimWriteup,
  completeWriteup,
  failWriteup,
  readWriteup,
  releaseStaleClaims,
  requestRewrite,
  STALE_AFTER_MS,
  type WriteupKey,
} from "./store";

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
    await expect(claim(pb, { inputHash: HASH_B, now: NOW + 1000 })).resolves.toMatchObject({ outcome: "claimed", id });
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "pending", input_hash: HASH_B, attempts: 1, output: WRITEUP });
  });

  it("calls a fresh pending row busy, and takes over a stale one", async () => {
    const pb = fresh();
    const { id } = await claim(pb);
    await expect(claim(pb, { now: NOW + 60_000 })).resolves.toEqual({ outcome: "busy", id });
    await expect(claim(pb, { now: NOW + STALE_AFTER_MS + 1 })).resolves.toMatchObject({ outcome: "claimed", id });
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
    await expect(claim(pb, { force: true })).resolves.toMatchObject({ outcome: "claimed", id });
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

  it("leaves a commissioner's request standing through the claim, so a crash mid-write is still asked for", async () => {
    const pb = fresh();
    const { id } = await claim(pb);
    await completeWriteup(pb.client, id, { writeup: WRITEUP, refs: {}, usage: USAGE, model: "m", now: NOW });
    await requestRewrite(pb.client, id, NOW + 1000);
    await claim(pb, { force: true, now: NOW + 2000 });
    expect(pb.rows("ai_writeups")[0]!.rewrite_requested_at).not.toBe("");

    // Finishing answers it; so does failing, or the minute check would ask the model every minute.
    await completeWriteup(pb.client, id, { writeup: WRITEUP, refs: {}, usage: USAGE, model: "m", now: NOW + 3000 });
    expect(pb.rows("ai_writeups")[0]!.rewrite_requested_at).toBe("");
    await requestRewrite(pb.client, id, NOW + 4000);
    await claim(pb, { force: true, now: NOW + 5000 });
    await failWriteup(pb.client, id, "stars: missing");
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "failed", rewrite_requested_at: "" });
  });

  it("puts a written row back when Google does not answer, and keeps the request standing", async () => {
    const pb = fresh();
    const { id } = await claim(pb);
    await completeWriteup(pb.client, id, { writeup: WRITEUP, refs: {}, usage: USAGE, model: "m", now: NOW });
    await requestRewrite(pb.client, id, NOW + 1000);
    const again = await claim(pb, { force: true, now: NOW + 2000 });
    expect(again).toEqual({ outcome: "claimed", id, previous: "ready", attempts: 2 });
    if (again.outcome !== "claimed") throw new Error("unreachable");

    await abandonClaim(pb.client, again, "Gemini's quota is used up for now (daily).", true);
    // No verdict on the sheet, so no attempt spent: a day of quota errors must not use up a round.
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "ready", output: WRITEUP, attempts: 1, error: "Gemini's quota is used up for now (daily)." });
    expect(pb.rows("ai_writeups")[0]!.rewrite_requested_at).not.toBe("");

    // A row that never held a write-up has nothing to go back to: it is failed, and still asked for.
    const other = fresh();
    const first = await claim(other);
    expect(first).toEqual({ outcome: "claimed", id: first.id, previous: null, attempts: 1 });
    if (first.outcome !== "claimed") throw new Error("unreachable");
    await abandonClaim(other.client, first, "Gemini did not answer (503: overloaded).", true);
    expect(other.rows("ai_writeups")[0]).toMatchObject({ status: "failed", attempts: 0 });
  });

  it("counts an attempt the model call broke for any other reason", async () => {
    const pb = fresh();
    const first = await claim(pb);
    if (first.outcome !== "claimed") throw new Error("unreachable");
    await abandonClaim(pb.client, first, "socket hang up", false);
    expect(pb.rows("ai_writeups")[0]).toMatchObject({ status: "failed", attempts: 1 });
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

describe("releaseStaleClaims", () => {
  it("puts back rows a dead writer left pending: written prose stays written, a row with none is failed", async () => {
    const at = (ms: number) => new Date(ms).toISOString().replace("T", " ");
    const row = (id: string, claimedAt: number, output?: unknown) => ({
      id, league: "L1", season: "E2026", round: 4, kind: "round_brief", member: id, status: "pending", attempts: 1, claimed_at: at(claimedAt), output: output ?? null,
    });
    const pb = fresh({
      ai_writeups: [row("m1", NOW - STALE_AFTER_MS - 1, WRITEUP), row("m2", NOW - STALE_AFTER_MS - 1), row("m3", NOW - 60_000, WRITEUP)],
    });
    await releaseStaleClaims(pb.client, NOW);
    expect(pb.rows("ai_writeups").map((entry) => [entry.member, entry.status])).toEqual([
      ["m1", "ready"],
      ["m2", "failed"],
      ["m3", "pending"],
    ]);
  });
});
