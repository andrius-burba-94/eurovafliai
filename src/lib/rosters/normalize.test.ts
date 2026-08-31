import { describe, expect, it } from "vitest";

import {
  mapApiPosition,
  mapCsvPosition,
  normalizeApiRow,
  normalizeName,
} from "./normalize";

describe("normalizeName", () => {
  it("folds diacritics, so Valančiūnas is findable as valanciunas", () => {
    // The example CONTEXT.md uses, and the reason this function exists.
    expect(normalizeName("Valančiūnas, Jonas")).toContain("valanciunas");
  });

  it("ignores word order, so the two sources can match each other", () => {
    // The API says "SIRVYDIS, DEIVIDAS"; a hand-made CSV will say "Deividas
    // Sirvydis". Both have to produce the same key or every CSV row would look
    // like a new player.
    expect(normalizeName("SIRVYDIS, DEIVIDAS")).toBe(
      normalizeName("Deividas Sirvydis"),
    );
  });

  it("ignores punctuation and extra whitespace", () => {
    expect(normalizeName("  O'Brien,   Jack-Ryan ")).toBe(
      normalizeName("Jack Ryan O Brien"),
    );
  });

  it("folds the letters that Unicode decomposition does not", () => {
    // NFD splits ā into a + macron, but ł, ø, đ and ß are single code points
    // with no decomposition — a plain NFD fold leaves them and the key keeps a
    // non-ASCII character nobody will ever type.
    expect(normalizeName("Ponitka, Mateusz")).toBe(
      normalizeName("Poñitka, Mateusz"),
    );
    expect(normalizeName("Sławomir")).toBe("slawomir");
    expect(normalizeName("Højbjerg")).toBe("hojbjerg");
    expect(normalizeName("Đorđević")).toBe("dordevic");
    expect(normalizeName("Weiß")).toBe("weiss");
    expect(normalizeName("Kæstel")).toBe("kaestel");
  });

  it("is idempotent, so re-normalising a stored key cannot drift", () => {
    const once = normalizeName("Valančiūnas, Jonas");
    expect(normalizeName(once)).toBe(once);
  });

  it("returns an empty string for input with no letters at all", () => {
    expect(normalizeName("   ,,  ")).toBe("");
  });
});

describe("mapApiPosition", () => {
  it("maps the only three values the API actually uses", () => {
    expect(mapApiPosition("Guard")).toBe("G");
    expect(mapApiPosition("Forward")).toBe("F");
    expect(mapApiPosition("Center")).toBe("C");
  });

  it("throws on anything else rather than guessing a bucket", () => {
    // docs/research/euroleague-api.md finding 1: across all 324 players the
    // vocabulary is exactly Guard / Forward / Center. So an unmapped value is
    // news — the feed changed — and defaulting it would put a player in the
    // wrong bucket silently, which corrupts every legality check downstream.
    expect(() => mapApiPosition("Guard-Forward")).toThrow(/Guard-Forward/);
    expect(() => mapApiPosition("")).toThrow();
  });
});

describe("mapCsvPosition", () => {
  it("accepts the single letters, in any case", () => {
    expect(mapCsvPosition("G")).toBe("G");
    expect(mapCsvPosition("f")).toBe("F");
    expect(mapCsvPosition(" c ")).toBe("C");
  });

  it("accepts the long names", () => {
    expect(mapCsvPosition("Guard")).toBe("G");
    expect(mapCsvPosition("forward")).toBe("F");
    expect(mapCsvPosition("Centre")).toBe("C");
  });

  it("takes the first bucket from a combined listing", () => {
    // The blueprint's rule: a multi-position listing maps to ONE bucket. First
    // listed is the primary position by convention, and the commissioner can
    // override afterwards — which is what manual_lock protects.
    expect(mapCsvPosition("G/F")).toBe("G");
    expect(mapCsvPosition("Guard-Forward")).toBe("G");
    expect(mapCsvPosition("F/C")).toBe("F");
    expect(mapCsvPosition("C-F")).toBe("C");
  });

  it("maps the five-position vocabulary a spreadsheet is likely to use", () => {
    expect(mapCsvPosition("PG")).toBe("G");
    expect(mapCsvPosition("SG")).toBe("G");
    expect(mapCsvPosition("SF")).toBe("F");
    expect(mapCsvPosition("PF")).toBe("F");
  });

  it("throws on something it cannot bucket", () => {
    expect(() => mapCsvPosition("wing")).toThrow(/wing/);
    expect(() => mapCsvPosition("")).toThrow();
  });
});

/** One real row, trimmed, exactly as api-live returns it. */
const apiRow = {
  person: {
    code: "009549",
    name: "CORDINIER, ISAIA",
    passportName: "ISAIA",
    passportSurname: "CORDINIER",
  },
  type: "J",
  typeName: "Player",
  active: true,
  dorsal: "10",
  position: 1,
  positionName: "Guard",
  club: { code: "IST", name: "Anadolu Efes Istanbul" },
  season: { name: "EuroLeague 2026-27" },
};

describe("normalizeApiRow", () => {
  it("produces the shared row shape both front doors feed", () => {
    expect(normalizeApiRow(apiRow)).toEqual({
      name: "Cordinier, Isaia",
      name_normalized: "cordinier isaia",
      club_code: "IST",
      club_name: "Anadolu Efes Istanbul",
      position: "G",
      status: "active",
      person_code: "009549",
      source: "api",
      dorsal: "10",
    });
  });

  it("prefers the passport fields over splitting the display string", () => {
    // The research notes these are a cleaner source than parsing
    // "SURNAME, FIRSTNAME" ourselves. Casing comes out title-case either way.
    const row = normalizeApiRow({
      ...apiRow,
      person: {
        ...apiRow.person,
        name: "DE COLO, NANDO",
        passportName: "NANDO",
        passportSurname: "DE COLO",
      },
    });
    expect(row.name).toBe("De Colo, Nando");
  });

  it("falls back to the display name when the passport fields are absent", () => {
    const row = normalizeApiRow({
      ...apiRow,
      person: { code: "1", name: "HALL, DONTA" },
    });
    expect(row.name).toBe("Hall, Donta");
    expect(row.name_normalized).toBe("donta hall");
  });

  it("collapses the doubled spaces the passport fields sometimes carry", () => {
    // Real E2026 data: IST's Bruno Fernando arrives as "BRUNO AFONSO  DAVID".
    const row = normalizeApiRow({
      ...apiRow,
      person: {
        code: "3",
        passportSurname: "FERNANDO",
        passportName: "BRUNO AFONSO  DAVID",
      },
    });
    expect(row.name).toBe("Fernando, Bruno Afonso David");
    expect(row.name_normalized).toBe("afonso bruno david fernando");
  });

  it("carries a missing person_code as null, not as an empty string", () => {
    // 13% of E2026 players have no code yet. `null` is the value the diff
    // treats as "unknown"; "" would look like a code that is present and empty,
    // and PocketBase stores unset text as "" — so the boundary matters here.
    const row = normalizeApiRow({
      ...apiRow,
      person: { name: "BURNELL, JASON" },
    });
    expect(row.person_code).toBeNull();
  });

  it("refuses a row that is not a player", () => {
    // Coaches arrive in the same response as type "E". An ingest that let one
    // through would put a coach in the draft pool.
    expect(() =>
      normalizeApiRow({ ...apiRow, type: "E", typeName: "Coach" }),
    ).toThrow(/type/i);
  });

  it("refuses a row with no club code, which nothing downstream could match", () => {
    expect(() =>
      normalizeApiRow({ ...apiRow, club: { code: "", name: "" } }),
    ).toThrow(/club/i);
  });
});
