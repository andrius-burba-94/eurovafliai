import { afterEach, describe, expect, it, vi } from "vitest";

import { readStored, subscribeStored, writeStored } from "./stored";

function stubStorage(storage: Partial<Storage>) {
  const target = new EventTarget();
  vi.stubGlobal("window", Object.assign(target, { localStorage: storage }));
}

describe("stored", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads and writes through localStorage and tells every subscriber", () => {
    const values = new Map<string, string>();
    stubStorage({
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => void values.set(key, value),
    });
    const listener = vi.fn();
    const off = subscribeStored(listener);

    writeStored("k", "v");

    expect(readStored("k")).toBe("v");
    expect(listener).toHaveBeenCalledOnce();
    off();
  });

  it("hears writes from another tab", () => {
    stubStorage({ getItem: () => null });
    const listener = vi.fn();
    const off = subscribeStored(listener);

    window.dispatchEvent(new Event("storage"));

    expect(listener).toHaveBeenCalledOnce();
    off();
  });

  it("reads nothing and still notifies when storage is denied", () => {
    stubStorage({
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => {
        throw new Error("quota");
      },
    });
    const listener = vi.fn();
    const off = subscribeStored(listener);

    expect(readStored("k")).toBeNull();
    expect(() => writeStored("k", "v")).not.toThrow();
    expect(listener).toHaveBeenCalledOnce();
    off();
  });
});
