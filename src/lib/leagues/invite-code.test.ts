import { describe, expect, it } from "vitest";

import {
  INVITE_ALPHABET,
  INVITE_CODE_LENGTH,
  buildInviteCode,
  generateInviteCode,
  inviteCodeSpaceSize,
  isPlausibleInviteCode,
  normalizeInviteCode,
} from "./invite-code";

describe("INVITE_ALPHABET", () => {
  it("excludes every character people confuse when reading or hearing a code", () => {
    for (const char of ["I", "O", "L", "U", "V", "0", "1"]) {
      expect(INVITE_ALPHABET).not.toContain(char);
    }
  });

  it("is uppercase and has no duplicates", () => {
    expect(INVITE_ALPHABET).toBe(INVITE_ALPHABET.toUpperCase());
    expect(new Set(INVITE_ALPHABET).size).toBe(INVITE_ALPHABET.length);
  });

  it("is large enough that collisions stay theoretical", () => {
    // 29^6 ≈ 594 million. The unique index is still the real guarantee.
    expect(inviteCodeSpaceSize()).toBe(29 ** 6);
    expect(inviteCodeSpaceSize(4)).toBeLessThan(inviteCodeSpaceSize(6));
  });
});

describe("buildInviteCode", () => {
  it("is deterministic for a given random source", () => {
    const always = () => 0;
    expect(buildInviteCode(always)).toBe(INVITE_ALPHABET[0].repeat(6));
  });

  it("produces the requested length", () => {
    expect(buildInviteCode(() => 0.5, 8)).toHaveLength(8);
    expect(buildInviteCode(() => 0.5)).toHaveLength(INVITE_CODE_LENGTH);
  });

  it("only ever emits alphabet characters", () => {
    let n = 0;
    const cycling = () => ((n = (n + 7) % 100), n / 100);
    for (let i = 0; i < 200; i += 1) {
      expect(isPlausibleInviteCode(buildInviteCode(cycling))).toBe(true);
    }
  });

  it("clamps a random source that returns 1 instead of indexing past the end", () => {
    // Math.random() never returns 1, but an injected source might, and
    // INVITE_ALPHABET[29] would silently be undefined.
    const code = buildInviteCode(() => 1);
    expect(code).toBe(INVITE_ALPHABET.at(-1)!.repeat(6));
    expect(code).not.toContain("undefined");
  });

  it("rejects a nonsensical length rather than returning an empty code", () => {
    expect(() => buildInviteCode(() => 0.5, 0)).toThrow(/positive integer/);
    expect(() => buildInviteCode(() => 0.5, -3)).toThrow(/positive integer/);
    expect(() => buildInviteCode(() => 0.5, 2.5)).toThrow(/positive integer/);
  });
});

describe("normalizeInviteCode", () => {
  it("accepts the ways a human actually retypes a code", () => {
    expect(normalizeInviteCode("abc234")).toBe("ABC234");
    expect(normalizeInviteCode("  ABC234\n")).toBe("ABC234");
    expect(normalizeInviteCode("ABC-234")).toBe("ABC234");
    expect(normalizeInviteCode("ab c2 34")).toBe("ABC234");
    expect(normalizeInviteCode("ABC_234")).toBe("ABC234");
  });

  it("does not invent a code out of confusable characters", () => {
    // A typed 0/1/I cannot be valid, and guessing could join the wrong league.
    expect(isPlausibleInviteCode(normalizeInviteCode("ABC01I"))).toBe(false);
  });
});

describe("isPlausibleInviteCode", () => {
  it("accepts a well-formed code", () => {
    expect(isPlausibleInviteCode("ABC234")).toBe(true);
  });

  it("rejects wrong lengths and foreign characters", () => {
    expect(isPlausibleInviteCode("ABC23")).toBe(false);
    expect(isPlausibleInviteCode("ABC2345")).toBe(false);
    expect(isPlausibleInviteCode("ABC23!")).toBe(false);
    expect(isPlausibleInviteCode("abc234")).toBe(false); // normalize first
    expect(isPlausibleInviteCode("")).toBe(false);
  });
});

describe("generateInviteCode", () => {
  it("produces plausible codes", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(isPlausibleInviteCode(generateInviteCode())).toBe(true);
    }
  });

  it("does not repeat itself in a small sample", () => {
    const codes = new Set(
      Array.from({ length: 500 }, () => generateInviteCode()),
    );
    expect(codes.size).toBe(500);
  });
});
