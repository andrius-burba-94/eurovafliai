import { describe, expect, it } from "vitest";

import { getSafeActionError, SafeActionError } from "./safe-error";

describe("getSafeActionError", () => {
  it("returns the fallback when there is no error", () => {
    expect(getSafeActionError(null, "Try again.")).toBe("Try again.");
  });

  it("passes through a sentence this app wrote", () => {
    expect(
      getSafeActionError(
        new SafeActionError("That is not yours to pick in."),
        "Try again.",
      ),
    ).toBe("That is not yours to pick in.");
  });

  it("hides PocketBase and provider internals", () => {
    expect(
      getSafeActionError(
        new Error("Something went wrong."),
        "Could not save that. Try again.",
      ),
    ).toBe("Could not save that. Try again.");
    expect(
      getSafeActionError(
        new Error("Failed to authenticate."),
        "Could not save that. Try again.",
      ),
    ).toBe("Could not save that. Try again.");
  });
});
