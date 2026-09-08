import { describe, expect, it, vi } from "vitest";

import {
  onAuthenticationLost,
  onConnectionLost,
  reportRealtimeError,
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
