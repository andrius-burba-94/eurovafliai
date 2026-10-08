import { describe, expect, it } from "vitest";

import { canonicalJson, inputHash, numbersIn, sha256Hex } from "./facts";

describe("canonicalJson", () => {
  it("does not depend on key order, at any depth", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: 2 } })).toBe(
      canonicalJson({ a: { c: 2, d: [1, { y: 2, z: 1 }] }, b: 1 }),
    );
  });

  it("keeps array order, which is meaning", () => {
    expect(canonicalJson([1, 2])).not.toBe(canonicalJson([2, 1]));
  });
});

describe("inputHash", () => {
  const parts = { kind: "round_summary", text: "x", refs: { "@T1": { kind: "member", id: "a" } }, voice: "analyst", promptVersion: "1", model: "m" };

  it("is a sha256 hex digest", () => {
    expect(inputHash(parts)).toMatch(/^[0-9a-f]{64}$/);
    expect(sha256Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("changes with the voice, the model or the prompt version", () => {
    const base = inputHash(parts);
    expect(inputHash({ ...parts, voice: "pundit" })).not.toBe(base);
    expect(inputHash({ ...parts, model: "other" })).not.toBe(base);
    expect(inputHash({ ...parts, promptVersion: "2" })).not.toBe(base);
  });
});

describe("numbersIn", () => {
  it("reads decimals, signs, thousands and ordinals as hundredths", () => {
    expect(numbersIn("143.0 then 143, +17.7 and −3.2, 1,234.5 for 3rd at 45%")).toEqual([
      14300, 14300, 1770, 320, 123450, 300, 4500,
    ]);
  });

  it("skips tokens and the digits inside words", () => {
    expect(numbersIn("@T12 beat #P3 in E2026 with a 5G build")).toEqual([]);
  });

  it("reads both sides of a score", () => {
    expect(numbersIn("won 88–77 at home")).toEqual([8800, 7700]);
  });

  it("does not split a decimal into two numbers", () => {
    expect(numbersIn("214.60")).toEqual([21460]);
  });
});
