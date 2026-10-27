import PocketBase, { ClientResponseError } from "pocketbase";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createPasses, superuserSession } from "./passes";

const NOW = new Date("2026-10-26T12:00:00.000Z");

/** A JWT carrying only `exp`, which is all the SDK's expiry check reads. */
function tokenExpiringIn(seconds: number): string {
  const payload = Buffer.from(JSON.stringify({ exp: NOW.getTime() / 1000 + seconds })).toString("base64").replace(/=+$/, "");
  return `header.${payload}.signature`;
}

function session(expiresIn: number) {
  const pb = new PocketBase("http://127.0.0.1:8095");
  const logins: string[] = [];
  const login = vi.fn(async () => {
    await Promise.resolve();
    logins.push("login");
    pb.authStore.save(tokenExpiringIn(86_400), null);
  });
  pb.authStore.save(expiresIn > 0 ? tokenExpiringIn(expiresIn) : "", null);
  return { pb, login, auth: superuserSession(pb, login, () => {}) };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => vi.useRealTimers());

describe("the superuser session", () => {
  it("logs in once for every pass that asks at the same moment", async () => {
    const { auth, login } = session(0);
    await Promise.all([auth.ensure(), auth.ensure(), auth.ensure()]);
    expect(login).toHaveBeenCalledTimes(1);
  });

  it("keeps a token with time left and renews one about to lapse", async () => {
    const fresh = session(3_600);
    await fresh.auth.ensure();
    expect(fresh.login).not.toHaveBeenCalled();

    const lapsing = session(5 * 60);
    await lapsing.auth.ensure();
    expect(lapsing.login).toHaveBeenCalledTimes(1);
  });

  it("never drops the token, so a concurrent pass cannot read as a guest", async () => {
    const { auth, pb, login } = session(3_600);
    const token = pb.authStore.token;
    auth.noteFailure(new Error("feed returned 503"));
    auth.noteFailure(new ClientResponseError({ status: 0 }));
    await auth.ensure();
    expect(login).not.toHaveBeenCalled();

    auth.noteFailure(new ClientResponseError({ status: 401 }));
    expect(pb.authStore.token).toBe(token);
    await auth.ensure();
    expect(login).toHaveBeenCalledTimes(1);
  });
});

function harness() {
  const lines: string[] = [];
  const auth = { ensure: vi.fn(async () => {}), noteFailure: vi.fn() };
  const passes = createPasses({ log: (message) => lines.push(message), auth });
  return { lines, auth, passes };
}

/** A pass that stays in flight until the test lets it go. */
function held() {
  let release = () => {};
  const run = vi.fn(() => new Promise<void>((resolve) => { release = resolve; }));
  return { run, release: () => release() };
}

describe("a scheduled pass", () => {
  it("never overlaps itself, and passes sharing a lock never overlap each other", async () => {
    const { passes } = harness();
    const pass = held();
    const lock = { current: null };
    const rewrite = vi.fn(async () => {});
    passes.schedule({ name: "write-ups · pass", firstAfterMs: 1_000, everyMs: 1_000, lock, run: pass.run });
    passes.schedule({ name: "write-ups · rewrite", firstAfterMs: 1_500, everyMs: 1_000, lock, run: rewrite });

    await vi.advanceTimersByTimeAsync(5_000);
    expect(pass.run).toHaveBeenCalledTimes(1);
    expect(rewrite).not.toHaveBeenCalled();

    pass.release();
    await vi.advanceTimersByTimeAsync(1_000);
    expect(rewrite).toHaveBeenCalled();
  });

  it("counts failures, logs at most one a minute, and says when it recovered", async () => {
    const { passes, lines, auth } = harness();
    let failing = true;
    passes.schedule({
      name: "BasketNews pass",
      firstAfterMs: 15_000,
      everyMs: 15_000,
      run: async () => {
        if (failing) throw new Error("feed down");
      },
    });
    await vi.advanceTimersByTimeAsync(5 * 15_000);
    expect(lines).toEqual([
      "BasketNews pass failed (1 in a row): feed down",
      "BasketNews pass failed (4 in a row): feed down",
    ]);
    expect(auth.noteFailure).toHaveBeenCalledTimes(5);

    failing = false;
    await vi.advanceTimersByTimeAsync(15_000);
    expect(lines.at(-1)).toBe("BasketNews pass recovered after 5 failed pass(es)");
  });

  it("runs once when it has no interval, and not at all when it is off", async () => {
    const { passes, lines } = harness();
    const once = vi.fn(async () => {});
    const off = vi.fn(async () => {});
    passes.schedule({ name: "previous season", firstAfterMs: 0, everyMs: 0, run: once });
    passes.schedule({ name: "news pass", firstAfterMs: 0, everyMs: 1_000, off: "news fetch is off", run: off });
    await vi.advanceTimersByTimeAsync(10_000);
    expect(once).toHaveBeenCalledTimes(1);
    expect(off).not.toHaveBeenCalled();
    expect(lines).toEqual(["news fetch is off"]);
  });
});

describe("draining at shutdown", () => {
  it("waits for every pass in flight and starts no new one", async () => {
    const { passes } = harness();
    const pass = held();
    passes.schedule({ name: "stats pass", firstAfterMs: 0, everyMs: 1_000, run: pass.run });
    await vi.advanceTimersByTimeAsync(0);

    let drained: boolean | null = null;
    void passes.drain(8_000).then((done) => { drained = done; });
    await vi.advanceTimersByTimeAsync(3_000);
    expect(drained).toBeNull();
    pass.release();
    await vi.advanceTimersByTimeAsync(0);
    expect(drained).toBe(true);
    expect(pass.run).toHaveBeenCalledTimes(1);
  });

  it("gives up at the deadline rather than hang the reload", async () => {
    const { passes } = harness();
    const tick = new Promise<void>(() => {});
    let drained: boolean | null = null;
    void passes.drain(8_000, [tick]).then((done) => { drained = done; });
    await vi.advanceTimersByTimeAsync(8_000);
    expect(drained).toBe(false);
  });
});
