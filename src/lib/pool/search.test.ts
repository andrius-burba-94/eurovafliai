import { describe, expect, it } from "vitest";

import {
  NO_FILTERS,
  clubsIn,
  selectPool,
  type PoolFilters,
  type PoolPlayer,
} from "./search";

import type { Position } from "@/lib/engine";

/**
 * The pool's filtering and search — slice 3.3.
 *
 * The questions worth asking of this are the ones a phone asks on draft night:
 * does typing part of a name find the player, does it still find them with the
 * diacritics missing and a letter transposed, and does a filter mean what the
 * tick-box says. All of them are questions about a function, which is why the
 * function is not inside the component.
 */

/** Ingestion's own folding, in miniature: lower-cased, marks stripped, sorted. */
const fold = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .trim()
    .split(/\s+/)
    .sort()
    .join(" ");

function player(name: string, over: Partial<PoolPlayer> = {}): PoolPlayer {
  return {
    // Explicit, never derived from the name: `\W` strips diacritics, so a
    // derived id turned "Valančiūnas" into "valaninas" and made four of these
    // assertions quietly wrong about what they were even looking for.
    id: over.id ?? name.split(",")[0]!.trim().toLowerCase(),
    name,
    normalized: fold(name),
    club: over.club ?? "ZAL",
    position: over.position ?? "G",
    status: over.status ?? "active",
    takenBy: over.takenBy ?? null,
    takenAt: over.takenAt ?? null,
    ...over,
  };
}

const POOL: PoolPlayer[] = [
  player("Valančiūnas, Jonas", { position: "C", club: "ZAL" }),
  player("Papagiannis, Georgios", { position: "C", club: "PAN" }),
  player("Sloukas, Kostas", { position: "G", club: "OLY" }),
  player("Nunn, Kendrick", { position: "G", club: "PAN" }),
  player("Shengelia, Tornike", { position: "F", club: "BAR" }),
  player("Motiejūnas, Donatas", {
    position: "F",
    club: "ZAL",
    status: "injured",
  }),
  player("Larkin, Shane", { position: "G", club: "EFS", status: "doubtful" }),
];

const FULL: Record<Position, number> = { G: 0, F: 0, C: 0 };
const OPEN: Record<Position, number> = { G: 5, F: 5, C: 3 };

const ids = (rows: { id: string }[]): string[] => rows.map((row) => row.id);

const run = (
  query: string,
  filters: Partial<PoolFilters> = {},
  needs: Record<Position, number> | null = OPEN,
  pool: PoolPlayer[] = POOL,
) =>
  selectPool({
    pool,
    filters: { ...NO_FILTERS, ...filters },
    query,
    needs,
  });

describe("selectPool — search", () => {
  it("finds a player by part of their surname", () => {
    expect(ids(run("slou"))).toEqual(["sloukas"]);
  });

  it("finds a name written with its diacritics when you type without them", () => {
    // The whole reason `name_normalized` is carried into the browser. This is
    // PRODUCT.md's own example: "Valančiūnas findable as valanciunas".
    expect(ids(run("valanciunas"))).toEqual(["valančiūnas"]);
    expect(ids(run("motiejunas"))).toEqual(["motiejūnas"]);
  });

  it("survives a transposed letter", () => {
    // "valancinuas" — the n and the u swapped, which is what a thumb does.
    expect(ids(run("valancinuas"))).toContain("valančiūnas");
  });

  it("finds a player by their first name, wherever it sits in the string", () => {
    // The pool stores "Surname, First", so a first name is at the far end of
    // the string. Without `ignoreLocation` fuse would score it far lower for a
    // reason no user could see.
    expect(ids(run("kendrick"))).toContain("nunn");
  });

  it("treats an exact club code as a filter rather than a fuzzy query", () => {
    // Three letters is a very loose fuzzy query — "PAN" genuinely scores a hit
    // on "Shane" — so a code is honoured exactly. Case does not matter.
    expect(ids(run("PAN")).sort()).toEqual(["nunn", "papagiannis"].sort());
    expect(ids(run("pan")).sort()).toEqual(["nunn", "papagiannis"].sort());
  });

  it("still fuzzy-searches a club code that is nobody's club", () => {
    expect(run("XYZ")).toEqual([]);
  });

  it("returns the pool untouched for an empty or whitespace query", () => {
    expect(ids(run(""))).toEqual(ids(POOL));
    expect(ids(run("   "))).toEqual(ids(POOL));
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(run("zzzzzz")).toEqual([]);
  });

  it("orders a query by relevance, not alphabetically", () => {
    // A search that returns its results in the pool's original order has
    // thrown away the only thing it computed.
    const rows = run("nunn");
    expect(rows[0]!.id).toBe("nunn");
  });
});

describe("selectPool — filters", () => {
  it("hides drafted players by default, and shows them when asked", () => {
    const pool = [
      ...POOL.slice(0, 2),
      player("Lessort, Mathias", {
        position: "C",
        club: "PAN",
        takenBy: "B Ballers",
        takenAt: 7,
      }),
    ];
    expect(ids(run("", {}, OPEN, pool))).not.toContain("lessort");
    expect(ids(run("", { hideDrafted: false }, OPEN, pool))).toContain(
      "lessort",
    );
  });

  it("marks a drafted player as drafted, with who took them", () => {
    const pool = [
      player("Lessort, Mathias", {
        position: "C",
        takenBy: "B Ballers",
        takenAt: 7,
      }),
    ];
    const [row] = run("", { hideDrafted: false }, OPEN, pool);
    expect(row!.drafted).toBe(true);
    expect(row!.takenBy).toBe("B Ballers");
    expect(row!.takenAt).toBe(7);
  });

  it("filters by position, one or several", () => {
    expect(ids(run("", { positions: ["C"] })).sort()).toEqual(
      ["papagiannis", "valančiūnas"].sort(),
    );
    expect(run("", { positions: ["C", "F"] })).toHaveLength(4);
    // Empty means every position, not none — the difference between a filter
    // that is off and a filter that excludes everything.
    expect(run("", { positions: [] })).toHaveLength(POOL.length);
  });

  it("filters by club", () => {
    expect(ids(run("", { club: "ZAL" })).sort()).toEqual(
      ["motiejūnas", "valančiūnas"].sort(),
    );
    expect(run("", { club: "" })).toHaveLength(POOL.length);
  });

  it("hides players the feed does not list as active, when asked", () => {
    // Injured and doubtful are both in the pool by default: a league may well
    // draft an injured star, and hiding him by default would be the app making
    // that call for them.
    expect(run("", {})).toHaveLength(POOL.length);
    const available = run("", { hideUnavailable: true });
    expect(ids(available)).not.toContain("motiejūnas");
    expect(ids(available)).not.toContain("larkin");
  });

  it("combines filters, and a query narrows what the filters left", () => {
    const rows = run("valan", { positions: ["C"], club: "ZAL" });
    expect(ids(rows)).toEqual(["valančiūnas"]);
  });

  it("does not let a query resurrect what a filter removed", () => {
    // Ticking "hide drafted" and then searching for the drafted player must
    // find nothing. Searching the whole pool and intersecting afterwards is the
    // implementation that gets this wrong.
    const pool = [
      player("Lessort, Mathias", { takenBy: "B Ballers", takenAt: 7 }),
    ];
    expect(run("lessort", { hideDrafted: true }, OPEN, pool)).toEqual([]);
    expect(run("lessort", { hideDrafted: false }, OPEN, pool)).toHaveLength(1);
  });
});

describe("selectPool — legality", () => {
  it("marks a player the picker has no room for", () => {
    const guardsFull: Record<Position, number> = { G: 0, F: 2, C: 1 };
    const rows = run("", {}, guardsFull);
    const sloukas = rows.find((row) => row.id === "sloukas");
    const shengelia = rows.find((row) => row.id === "shengelia");
    expect(sloukas!.noRoom).toBe(true);
    expect(shengelia!.noRoom).toBe(false);
  });

  it("still shows a player it has muted, because the server is the authority", () => {
    // 3.2's word is *muted*, not removed. Which guards are left matters even
    // when you cannot take one — it is what the rest of the table is about to
    // fight over — and a refusal that explains itself beats a missing control.
    const rows = run("", {}, FULL);
    expect(rows).toHaveLength(POOL.length);
    expect(rows.every((row) => row.noRoom)).toBe(true);
  });

  it("hides them only when legalOnly is ticked", () => {
    const guardsFull: Record<Position, number> = { G: 0, F: 2, C: 1 };
    const rows = run("", { legalOnly: true }, guardsFull);
    expect(ids(rows)).not.toContain("sloukas");
    expect(ids(rows)).not.toContain("nunn");
    expect(ids(rows)).toContain("shengelia");
  });

  it("legalOnly also drops anyone already drafted", () => {
    const pool = [
      player("Lessort, Mathias", {
        position: "C",
        takenBy: "B Ballers",
        takenAt: 7,
      }),
    ];
    expect(
      run("", { legalOnly: true, hideDrafted: false }, OPEN, pool),
    ).toEqual([]);
  });

  it("mutes nothing when nobody is on the clock", () => {
    // A paused or finished draft has no picker, so there is no roster to be
    // full. Muting the whole pool because `needs` happened to be absent would
    // read as "you can take nobody".
    const rows = run("", {}, null);
    expect(rows.every((row) => row.noRoom)).toBe(false);
  });
});

describe("clubsIn", () => {
  it("lists every club once, sorted", () => {
    expect(clubsIn(POOL)).toEqual(["BAR", "EFS", "OLY", "PAN", "ZAL"]);
  });

  it("is empty for an empty pool", () => {
    expect(clubsIn([])).toEqual([]);
  });
});
