import { describe, expect, it } from "vitest";

import { normalizeName } from "@/lib/rosters/normalize";

import { matchSheet, resolveSheet, type MatchablePlayer } from "./match";
import { parseCheatSheet } from "./parse";
import { tierOfRank } from "./ranking";

/**
 * The pool these tests match against — real names, because the failure modes
 * are about real names: diacritics, "Surname, Firstname", and two players who
 * share one.
 */
const player = (id: string, name: string, club = "ZAL", position = "G") =>
  ({
    id,
    name,
    normalized: normalizeName(name),
    club,
    position,
  }) as MatchablePlayer;

const POOL: MatchablePlayer[] = [
  player("p1", "Valančiūnas, Jonas", "ZAL", "C"),
  player("p2", "Nunn, Kendrick", "PAN", "G"),
  player("p3", "Sloukas, Kostas", "PAO", "G"),
  player("p4", "Mirotić, Nikola", "MCO", "F"),
  player("p5", "Lekavicius, Lukas", "ZAL", "G"),
];

const entriesFor = (text: string, pool = POOL) =>
  matchSheet(parseCheatSheet(text).rows, pool);

describe("matchSheet", () => {
  it("matches a surname exactly", () => {
    const [entry] = entriesFor("Sloukas");
    expect(entry?.status).toBe("matched");
    expect(entry?.playerId).toBe("p3");
  });

  it("matches a folded spelling of a diacritic name", () => {
    // The whole reason ingestion stores `name_normalized`: nobody types č.
    const [entry] = entriesFor("valanciunas");
    expect(entry?.status).toBe("matched");
    expect(entry?.playerId).toBe("p1");
  });

  it("matches the pool's own spelling, diacritics and all", () => {
    const [entry] = entriesFor("Valančiūnas");
    expect(entry?.playerId).toBe("p1");
  });

  it("matches a name written the other way round", () => {
    // `name_normalized` sorts its tokens, so word order cannot matter.
    const [entry] = entriesFor("Jonas Valanciunas");
    expect(entry?.status).toBe("matched");
    expect(entry?.playerId).toBe("p1");
  });

  it("survives a transposition", () => {
    const [entry] = entriesFor("valancinuas");
    expect(entry?.status).toBe("matched");
    expect(entry?.playerId).toBe("p1");
  });

  it("reports a name the pool has never heard of", () => {
    const [entry] = entriesFor("Zdenek Vopicka");
    expect(entry?.status).toBe("unmatched");
    expect(entry?.playerId).toBeNull();
    expect(entry?.candidates).toEqual([]);
  });

  it("asks rather than guesses when two players share a folded name", () => {
    const twins = [...POOL, player("p6", "Sloukas, Kostas", "OLY", "G")];
    const [entry] = entriesFor("Sloukas, Kostas", twins);
    expect(entry?.status).toBe("ambiguous");
    expect(entry?.playerId).toBeNull();
    expect(entry?.candidates.map((one) => one.id)).toEqual(["p3", "p6"]);
  });

  it("asks when two different players are equally plausible", () => {
    // Two Lekaviciuses: a bare surname cannot choose between them, and a sheet
    // that picked one would be drafting for somebody who never said which.
    const brothers = [...POOL, player("p7", "Lekavicius, Marius", "RYT", "G")];
    const [entry] = entriesFor("Lekavicius", brothers);
    expect(entry?.status).toBe("ambiguous");
    expect(entry?.candidates.map((one) => one.id)).toEqual(["p5", "p7"]);
  });

  it("names the same player twice as a duplicate, keeping the first place", () => {
    const entries = entriesFor("1,Nunn\n2,Sloukas\n3,Nunn, Kendrick");
    expect(entries.map((entry) => entry.status)).toEqual([
      "matched",
      "matched",
      "duplicate",
    ]);
    expect(resolveSheet(entries).ranking).toEqual(["p2", "p3"]);
  });

  it("drops a claimed player from a later line's choices", () => {
    const twins = [...POOL, player("p6", "Sloukas, Kostas", "OLY", "G")];
    const entries = matchSheet(
      parseCheatSheet("Sloukas, Kostas\nSloukas, Kostas").rows,
      twins,
    );
    // The first line is a choice between two; nothing was claimed by it,
    // because nothing was decided.
    expect(entries[0]?.candidates.map((one) => one.id)).toEqual(["p3", "p6"]);
    expect(entries[1]?.candidates.map((one) => one.id)).toEqual(["p3", "p6"]);
  });

  it("is deterministic — the same sheet resolves identically twice", () => {
    const once = entriesFor("valanciunas\nnunn\nmirotic");
    const twice = entriesFor("valanciunas\nnunn\nmirotic");
    expect(resolveSheet(once)).toEqual(resolveSheet(twice));
  });
});

describe("the confirm step offers a choice, not a menu", () => {
  it("caps a FUZZY shortlist at three, so the select is four options", () => {
    // The control adds "Leave this line out", so the cap is one less than the
    // four this module calls the limit of a choice. At 4 the select rendered
    // five options, one past its own rule.
    const crowd = [
      ...POOL,
      player("p6", "Sloukavis, Kostis", "OLY", "G"),
      player("p7", "Sloukanis, Kostos", "BAR", "F"),
      player("p8", "Sloukalis, Kostus", "MAD", "C"),
      player("p9", "Sloukaris, Kostes", "MIL", "G"),
    ];
    const [entry] = entriesFor("Slouka", crowd);
    expect(entry?.status).toBe("ambiguous");
    expect(entry?.candidates.length).toBeLessThanOrEqual(3);
  });

  it("does NOT cap an exact tie — every one of them is the name you typed", () => {
    // Truncating here could remove the only right answer. A fuzzy list is a
    // ranking whose tail is noise; this is a tie, and all of it is signal.
    const twins = [
      ...POOL,
      player("p6", "Sloukas, Kostas", "OLY", "G"),
      player("p7", "Sloukas, Kostas", "BAR", "F"),
      player("p8", "Sloukas, Kostas", "MAD", "C"),
    ];
    const [entry] = entriesFor("Sloukas, Kostas", twins);
    expect(entry?.status).toBe("ambiguous");
    expect(entry?.candidates.map((one) => one.id)).toEqual([
      "p3",
      "p6",
      "p7",
      "p8",
    ]);
  });
});

describe("resolveSheet", () => {
  it("keeps the sheet's order", () => {
    const entries = entriesFor("Mirotic\nNunn\nSloukas");
    expect(resolveSheet(entries).ranking).toEqual(["p4", "p2", "p3"]);
  });

  it("records a break wherever the tier column changes", () => {
    const entries = entriesFor(
      "1,1,Nunn\n2,1,Sloukas\n3,2,Mirotic\n4,3,valanciunas",
    );
    const { ranking, tiers } = resolveSheet(entries);
    expect(ranking).toEqual(["p2", "p3", "p4", "p1"]);
    // Tier 1 is ranks 1–2, tier 2 is rank 3, tier 3 is rank 4.
    expect(tiers).toEqual([2, 3]);
  });

  it("treats a written tier label the same as a number", () => {
    const entries = entriesFor("rank,tier,name\n1,elite,Nunn\n2,good,Sloukas");
    expect(resolveSheet(entries).tiers).toEqual([1]);
  });

  it("records no breaks for a sheet with no tier column", () => {
    expect(resolveSheet(entriesFor("Nunn\nSloukas\nMirotic")).tiers).toEqual(
      [],
    );
  });

  it("takes a confirmed choice for an ambiguous line", () => {
    const twins = [...POOL, player("p6", "Sloukas, Kostas", "OLY", "G")];
    const entries = matchSheet(
      parseCheatSheet("Nunn\nSloukas, Kostas").rows,
      twins,
    );
    expect(resolveSheet(entries).ranking).toEqual(["p2"]);
    expect(resolveSheet(entries, new Map([[2, "p6"]])).ranking).toEqual([
      "p2",
      "p6",
    ]);
  });

  it("takes an empty choice as 'leave this line out'", () => {
    const entries = entriesFor("Nunn\nSloukas");
    expect(resolveSheet(entries, new Map([[1, ""]])).ranking).toEqual(["p3"]);
  });

  it("does not let a choice smuggle in a player another line already has", () => {
    const entries = entriesFor("Nunn\nZdenek Vopicka");
    expect(resolveSheet(entries, new Map([[2, "p2"]])).ranking).toEqual(["p2"]);
  });

  it("keeps a break honest when the line before it was left out", () => {
    // Line 2 is dropped, so the break the sheet described between tiers 1 and 2
    // has to land after one player, not two.
    const entries = entriesFor("1,1,Nunn\n2,1,Sloukas\n3,2,Mirotic");
    expect(resolveSheet(entries, new Map([[2, ""]])).tiers).toEqual([1]);
  });
});

describe("tierOfRank", () => {
  it("counts tiers from the break positions", () => {
    const tiers = [2, 3];
    expect([1, 2, 3, 4, 5].map((rank) => tierOfRank(rank, tiers))).toEqual([
      1, 1, 2, 3, 3,
    ]);
  });

  it("is tier 1 all the way down when nothing breaks", () => {
    expect(tierOfRank(40, [])).toBe(1);
  });
});
