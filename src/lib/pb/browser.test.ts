import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type PocketBase from "pocketbase";

import {
  attachSurface,
  keepLinked,
  onAuthenticationLost,
  onConnectionLost,
  reportRealtimeError,
  retryDelay,
} from "./browser";

describe("reportRealtimeError", () => {
  it("treats an authorization refusal as terminal", () => {
    const authLost = vi.fn();
    const transportLost = vi.fn();
    const offAuth = onAuthenticationLost(authLost);
    const offTransport = onConnectionLost(transportLost);

    expect(reportRealtimeError({ status: 403 })).toBe("auth");
    expect(authLost).toHaveBeenCalledOnce();
    expect(transportLost).not.toHaveBeenCalled();

    offAuth();
    offTransport();
  });

  it("treats a network failure as retryable transport loss", () => {
    const transportLost = vi.fn();
    const off = onConnectionLost(transportLost);

    expect(reportRealtimeError({ status: 0 })).toBe("transport");
    expect(transportLost).toHaveBeenCalledOnce();

    off();
  });
});

/** Just enough of the SDK's realtime client: `connect()` plays a `PB_CONNECT`. */
function fakePb({ connected = false, valid = true } = {}) {
  const onConnect: Array<() => void> = [];
  const realtime = {
    isConnected: connected,
    subscribe: vi.fn(async (topic: string, callback: () => void) => {
      if (topic === "PB_CONNECT") onConnect.push(callback);
      return async () => {};
    }),
    unsubscribe: vi.fn(async () => {}),
  };
  const pb = { realtime, authStore: { isValid: valid } } as unknown as PocketBase;
  const connect = () => {
    realtime.isConnected = true;
    for (const callback of onConnect) callback();
  };
  return { pb, realtime, connect };
}

function stubPage() {
  vi.stubGlobal("window", new EventTarget());
  vi.stubGlobal("document", Object.assign(new EventTarget(), { visibilityState: "visible" }));
}

describe("keepLinked", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    stubPage();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("retries a first connect the SDK gave up on, with backoff", async () => {
    const { pb, realtime } = fakePb();
    realtime.subscribe.mockRejectedValueOnce({ status: 0 });
    const lost = vi.fn();
    const off = onConnectionLost(lost);
    const stop = keepLinked(pb);

    await vi.waitFor(() => expect(lost).toHaveBeenCalledOnce());
    await vi.waitFor(() => expect(realtime.unsubscribe).toHaveBeenCalledWith("PB_CONNECT"));
    expect(realtime.subscribe).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(retryDelay(0));
    expect(realtime.subscribe).toHaveBeenCalledTimes(2);

    stop();
    off();
  });

  it("retries at once when the phone comes back online", async () => {
    const { pb, realtime } = fakePb();
    realtime.subscribe.mockRejectedValueOnce({ status: 0 });
    const stop = keepLinked(pb);

    await vi.waitFor(() => expect(realtime.unsubscribe).toHaveBeenCalled());
    await Promise.resolve();
    window.dispatchEvent(new Event("online"));
    expect(realtime.subscribe).toHaveBeenCalledTimes(2);

    stop();
  });

  it("never retries a refused token", async () => {
    const { pb, realtime } = fakePb();
    realtime.subscribe.mockRejectedValueOnce({ status: 401 });
    const authLost = vi.fn();
    const off = onAuthenticationLost(authLost);
    const stop = keepLinked(pb);

    await vi.waitFor(() => expect(authLost).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(retryDelay(5));
    window.dispatchEvent(new Event("online"));
    expect(realtime.subscribe).toHaveBeenCalledOnce();

    stop();
    off();
  });

  it("sends an expired token to sign-in when the page is shown again", () => {
    const { pb } = fakePb({ valid: false });
    const authLost = vi.fn();
    const off = onAuthenticationLost(authLost);
    const stop = keepLinked(pb);

    document.dispatchEvent(new Event("visibilitychange"));

    expect(authLost).toHaveBeenCalledOnce();
    stop();
    off();
  });

  it("closes its stream when stopped", () => {
    const { pb, realtime } = fakePb();
    keepLinked(pb)();
    expect(realtime.unsubscribe).toHaveBeenCalledWith();
  });
});

describe("attachSurface", () => {
  beforeEach(() => {
    stubPage();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("comes up at once on a stream that is already open, as after a client-side navigation", async () => {
    const { pb } = fakePb({ connected: true });
    const stop = keepLinked(pb);
    const off = vi.fn();
    const subscribe = vi.fn(async () => [off]);
    const onUp = vi.fn();

    const detach = attachSurface(pb, { subscribe, onUp });

    await vi.waitFor(() => expect(onUp).toHaveBeenCalledOnce());
    expect(subscribe).toHaveBeenCalledOnce();
    detach();
    await vi.waitFor(() => expect(off).toHaveBeenCalledOnce());
    stop();
  });

  it("opens its topics on the first connect and catches up on every one", async () => {
    const { pb, connect } = fakePb();
    const stop = keepLinked(pb);
    const subscribe = vi.fn(async () => []);
    const onUp = vi.fn();
    const detach = attachSurface(pb, { subscribe, onUp });
    await Promise.resolve();
    expect(subscribe).not.toHaveBeenCalled();

    connect();
    await vi.waitFor(() => expect(onUp).toHaveBeenCalledOnce());
    connect();
    await vi.waitFor(() => expect(onUp).toHaveBeenCalledTimes(2));
    expect(subscribe).toHaveBeenCalledOnce();

    detach();
    stop();
  });

  it("sends an expired token to sign-in instead of listening deaf", () => {
    const { pb } = fakePb({ connected: true, valid: false });
    const authLost = vi.fn();
    const off = onAuthenticationLost(authLost);
    const subscribe = vi.fn(async () => []);
    const onUp = vi.fn();

    const detach = attachSurface(pb, { subscribe, onUp });

    expect(authLost).toHaveBeenCalledOnce();
    expect(subscribe).not.toHaveBeenCalled();
    expect(onUp).not.toHaveBeenCalled();
    detach();
    off();
  });

  it("stays quiet once detached", async () => {
    const { pb } = fakePb({ connected: true });
    const off = vi.fn();
    const onUp = vi.fn();

    attachSurface(pb, { subscribe: async () => [off], onUp })();

    await vi.waitFor(() => expect(off).toHaveBeenCalledOnce());
    expect(onUp).not.toHaveBeenCalled();
  });
});
