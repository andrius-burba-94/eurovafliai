import { describe, expect, it } from "vitest";

import {
  CREST_SHAPES,
  TEAM_COLORS,
  TEAM_INK,
  crestMonogram,
  defaultIdentity,
  identityOf,
  stylesFromRecords,
} from "./identity";

describe("crestMonogram", () => {
  it("takes the first letter of the first two words, keeping diacritics", () => {
    expect(crestMonogram("Šeštadienio Tritaškiai")).toBe("ŠT");
    expect(crestMonogram("Visi geri nėr ką išleist")).toBe("VG");
    expect(crestMonogram("Kėdainių Kometos")).toBe("KK");
  });

  it("takes two letters of a one-word name", () => {
    expect(crestMonogram("Ausys")).toBe("AU");
    expect(crestMonogram("  fbk  ")).toBe("FB");
  });

  it("ignores punctuation and never returns an empty crest", () => {
    expect(crestMonogram("FBK — Kisiel")).toBe("FK");
    expect(crestMonogram("")).toBe("?");
    expect(crestMonogram("!!")).toBe("?");
  });
});

describe("defaultIdentity", () => {
  it("gives the first twelve members twelve different colours", () => {
    const colours = Array.from({ length: 12 }, (_, index) => defaultIdentity(index).color);
    expect(new Set(colours).size).toBe(12);
  });

  it("is deterministic and total", () => {
    expect(defaultIdentity(3)).toEqual(defaultIdentity(3));
    expect(TEAM_COLORS).toContain(defaultIdentity(-1).color);
    expect(CREST_SHAPES).toContain(defaultIdentity(Number.NaN).shape);
  });
});

describe("identityOf", () => {
  it("keeps a valid stored choice", () => {
    expect(identityOf({ color: "violet", shape: "hex" }, 0)).toEqual({ color: "violet", shape: "hex" });
  });

  it("falls back per field when a stored value is missing or unknown", () => {
    expect(identityOf({ color: "neon", shape: "hex" }, 0)).toEqual({ color: defaultIdentity(0).color, shape: "hex" });
    expect(identityOf({}, 2)).toEqual(defaultIdentity(2));
  });
});

describe("TEAM_INK", () => {
  it("names an ink for every colour", () => {
    for (const colour of TEAM_COLORS) expect(["dark", "light"]).toContain(TEAM_INK[colour]);
  });
});

describe("stylesFromRecords", () => {
  it("agrees with the id order toMember is given, whatever order rows arrive in", () => {
    const rows = [{ id: "c" }, { id: "a", team_color: "lime", team_crest: "hex" }, { id: "b" }];
    const styles = stylesFromRecords(rows);
    expect(styles.a).toEqual({ color: "lime", crest: "hex" });
    expect(styles.b).toEqual({ color: defaultIdentity(1).color, crest: defaultIdentity(1).shape });
    expect(styles.c).toEqual({ color: defaultIdentity(2).color, crest: defaultIdentity(2).shape });
  });
});
