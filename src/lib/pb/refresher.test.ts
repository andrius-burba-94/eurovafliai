import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { COALESCE_MS, refresher } from "./refresher";

describe("refresher", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces a burst of events into one refresh", () => {
    const run = vi.fn();
    const gate = refresher({ run, hidden: () => false });

    gate.request();
    gate.request();
    gate.request();
    vi.advanceTimersByTime(COALESCE_MS);

    expect(run).toHaveBeenCalledOnce();
  });

  it("owes one refresh for events that arrive while one is in flight", () => {
    const run = vi.fn();
    const gate = refresher({ run, hidden: () => false });

    gate.request();
    vi.advanceTimersByTime(COALESCE_MS);
    gate.request();
    gate.request();
    vi.advanceTimersByTime(COALESCE_MS);
    expect(run).toHaveBeenCalledOnce();

    gate.settled();
    expect(run).toHaveBeenCalledTimes(2);
    gate.settled();
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("settles by itself when the refresh is a promise", async () => {
    let finish = () => {};
    const run = vi.fn(() => new Promise<void>((resolve) => (finish = resolve)));
    const gate = refresher({ run, hidden: () => false });

    gate.request();
    vi.advanceTimersByTime(COALESCE_MS);
    gate.request();
    vi.advanceTimersByTime(COALESCE_MS);
    finish();
    await vi.waitFor(() => expect(run).toHaveBeenCalledTimes(2));
  });

  it("holds refreshes while the tab is hidden and catches up once when shown", () => {
    let hidden = true;
    const run = vi.fn();
    const gate = refresher({ run, hidden: () => hidden });

    gate.request();
    vi.advanceTimersByTime(COALESCE_MS);
    gate.request();
    vi.advanceTimersByTime(COALESCE_MS);
    expect(run).not.toHaveBeenCalled();

    hidden = false;
    gate.shown();
    gate.shown();
    expect(run).toHaveBeenCalledOnce();
  });

  it("does nothing when shown with nothing owed", () => {
    const run = vi.fn();
    refresher({ run, hidden: () => false }).shown();
    expect(run).not.toHaveBeenCalled();
  });

  it("drops a pending refresh on dispose", () => {
    const run = vi.fn();
    const gate = refresher({ run, hidden: () => false });

    gate.request();
    gate.dispose();
    vi.advanceTimersByTime(COALESCE_MS);

    expect(run).not.toHaveBeenCalled();
  });
});
