import { describe, expect, it } from "vitest";

import { normalizeName } from "./normalize";
import {
  looksLikeRename,
  nameTokens,
  proposeRenames,
  tokensMatch,
} from "./rename";
import type { ExistingPlayer, NormalizedPlayer } from "./types";

/**
 * The rename rule, against the pairs that made it necessary.
 *
 * Every row in `REAL_PAIRS` was measured on 2026-09-08 by diffing the live
 * E2026 feed against the real pool: thirteen arrivals that were the same human
 * as a departure. `DIFFERENT_PEOPLE` is the other half of the evidence — pairs
 * that share a surname and a club and must never be merged. `Nunn, Kendrick`
 * and `Nunn, Kevarrius` are both real Euroleague players, and a fuse threshold
 * low enough to catch the hardest true pair merges them.
 */
const REAL_PAIRS: [string, string][] = [
  ["Burnell, Jason", "Burnell, Jason Scott"],
  ["Mathews, Garrison", "Mathews, Garrison Reid"],
  ["Mintz, Davion", "Mintz, Davion Dee Lee Oneal"],
  ["Baugh, Damion", "Baugh, Damion Devon"],
  ["Thompson, Ethan", "Thompson, Ethan Ivan"],
  ["Gueye, Mo", "Gueye, Mouhamadou"],
  ["Bello, Rasheed", "Bello, Abdulrasheed Olamilekan"],
  ["Klintman, Bobi", "Klintman, Bo"],
  ["Duarte, Chris", "Theoret Duarte, Christopher"],
  ["Cardenas, Alvaro", "Cardenas Torre, Alvaro"],
  ["Corbalan, Gonzalo", "Corbalan Gutierrez, Gonzalo"],
  // The generational suffix the two sources disagree about: stored carries
  // "Jr", the feed does not. Found by running the rule against the live feed,
  // where it was the only remaining `candidate` that was obviously a rename.
  ["Moore Jr, Wendell", "Moore, Wendell Horace"],
];

/**
 * The three real pairs containment does **not** catch, kept as a list rather
 * than as a wish. Each is a nickname replaced by a legal name, which is not a
 * string-distance problem: `Aj` and `Anthony` share one letter. They are still
 * quarantined and offered as candidates — see the `proposeRenames` tests — so
 * the pool does not gain a duplicate; they just need a person to say yes.
 */
const NICKNAME_PAIRS: [string, string][] = [
  ["Juzang, Johnny", "Juzang, Jonathan"],
  ["Lawson, Aj", "Lawson, Anthony"],
  ["Pereira, Maozinha", "Cardoso Pereira, Joao"],
];

const DIFFERENT_PEOPLE: [string, string][] = [
  ["Nunn, Kendrick", "Nunn, Kevarrius"],
  ["Jones, Tyler", "Jones, Carlik"],
  ["Brown, Vittorio", "Brown, Sterling"],
  ["Williams, Grant", "Williams-Goss, Nigel"],
  ["Smith, John", "Susic, Andrija"],
];

const same = (a: string, b: string) =>
  looksLikeRename(normalizeName(a), normalizeName(b)).same;

describe("nameTokens", () => {
  it("splits a normalized name into its parts", () => {
    expect(nameTokens(normalizeName("Cardenas Torre, Alvaro"))).toEqual([
      "alvaro",
      "cardenas",
      "torre",
    ]);
  });

  it("splits a hyphenated surname, because the feed is inconsistent about it", () => {
    expect(nameTokens(normalizeName("Williams-Goss, Nigel"))).toContain("goss");
  });

  it("folds diacritics, so a rename is not invented by an accent", () => {
    expect(nameTokens(normalizeName("Valančiūnas, Jonas"))).toEqual([
      "jonas",
      "valanciunas",
    ]);
  });
});

describe("tokensMatch", () => {
  it.each([
    ["burnell", "burnell", true, "equal"],
    ["mo", "mouhamadou", true, "a two-letter prefix"],
    ["chris", "christopher", true, "a longer prefix"],
    ["bo", "bobi", true, "a prefix the other way round"],
    ["rasheed", "abdulrasheed", true, "a substring of four or more"],
    ["a", "anthony", false, "a single letter is an initial, not a name"],
    ["aj", "anthony", false, "initials are not a prefix"],
    ["kendrick", "kevarrius", false, "a shared first letter is nothing"],
    ["ana", "fontana", false, "a three-letter substring is everywhere"],
    ["johnny", "jonathan", false, "a nickname is not a string distance"],
  ])("%s / %s → %s (%s)", (a, b, expected) => {
    expect(tokensMatch(a, b)).toBe(expected);
  });
});

describe("looksLikeRename", () => {
  it.each(REAL_PAIRS)("pairs %s with %s", (stored, incoming) => {
    expect(same(stored, incoming)).toBe(true);
  });

  it.each(DIFFERENT_PEOPLE)("refuses %s and %s", (stored, incoming) => {
    expect(same(stored, incoming)).toBe(false);
  });

  it.each(NICKNAME_PAIRS)(
    "does not claim %s is %s — it is offered as a candidate instead",
    (stored, incoming) => {
      expect(same(stored, incoming)).toBe(false);
    },
  );

  it("explains itself in terms a person can check", () => {
    const { reason } = looksLikeRename(
      normalizeName("Burnell, Jason"),
      normalizeName("Burnell, Jason Scott"),
    );
    expect(reason).toContain("burnell");
    expect(reason).toContain("adds 1 more name part");
  });

  it("names the part it could not account for when it refuses", () => {
    const { reason } = looksLikeRename(
      normalizeName("Nunn, Kendrick"),
      normalizeName("Nunn, Kevarrius"),
    );
    expect(reason).toContain("kendrick");
  });

  it("ignores a generational suffix on either side", () => {
    expect(same("Moore Jr, Wendell", "Moore, Wendell Horace")).toBe(true);
    expect(same("Moore, Wendell", "Moore III, Wendell Horace")).toBe(true);
  });

  it("does not treat a bare V as a suffix, because it might be a name", () => {
    // `iv` and `iii` are unambiguous; `v` is not, and being wrong here merges
    // two people.
    expect(same("V, Wendell", "Moore, Wendell Horace")).toBe(false);
  });

  it("needs one exact part, not a pile of near misses", () => {
    // `jon smi` against `jonathan smith` is two prefixes and no evidence.
    expect(same("Smi, Jon", "Smith, Jonathan")).toBe(false);
  });

  it("will not reuse one token to cover two", () => {
    // Without distinctness, `{jon, jonathan}` would be "covered" twice by the
    // single token `jonathan`.
    expect(same("Jonathan, Jon", "Jonathan, Peter")).toBe(false);
  });

  it("is symmetric — which name is stored does not change the answer", () => {
    for (const [stored, incoming] of [...REAL_PAIRS, ...DIFFERENT_PEOPLE]) {
      expect(same(stored, incoming)).toBe(same(incoming, stored));
    }
  });
});

const stored = (
  name: string,
  club: string,
  over: Partial<ExistingPlayer> = {},
): ExistingPlayer => ({
  id: `p_${name.replace(/\W/g, "")}`,
  name,
  name_normalized: normalizeName(name),
  club_code: club,
  club_name: club,
  position: "G",
  status: "active",
  person_code: null,
  source: "api",
  dorsal: "1",
  manual_lock: false,
  ...over,
});

const arriving = (
  name: string,
  club: string,
  code: string | null = "014782",
): NormalizedPlayer => ({
  name,
  name_normalized: normalizeName(name),
  club_code: club,
  club_name: club,
  position: "G",
  status: "active",
  person_code: code,
  source: "api",
  dorsal: "1",
});

describe("proposeRenames", () => {
  it("pairs a codeless departure with the coded arrival that is the same person", () => {
    const { proposals, pairedIncoming } = proposeRenames({
      departing: [stored("Burnell, Jason", "MIL")],
      arriving: [arriving("Burnell, Jason Scott", "MIL", "014782")],
    });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.confidence).toBe("likely");
    expect(proposals[0]!.existing.name).toBe("Burnell, Jason");
    expect(proposals[0]!.incoming.person_code).toBe("014782");
    // Both sides are claimed, which is what takes them out of adds and leaving.
    expect(pairedIncoming.size).toBe(1);
  });

  it("never pairs across clubs", () => {
    const { proposals } = proposeRenames({
      departing: [stored("Burnell, Jason", "MIL")],
      arriving: [arriving("Burnell, Jason Scott", "BAR")],
    });
    expect(proposals).toEqual([]);
  });

  it("leaves a stored row that already has a code alone", () => {
    // A stored code that did not match is a different problem — a code changed,
    // or two collide — and `diffRosters` refuses that out loud already.
    const { proposals } = proposeRenames({
      departing: [stored("Burnell, Jason", "MIL", { person_code: "000111" })],
      arriving: [arriving("Burnell, Jason Scott", "MIL")],
    });
    expect(proposals).toEqual([]);
  });

  it("ignores an arrival with no code, because filling one in is the point", () => {
    const { proposals } = proposeRenames({
      departing: [stored("Burnell, Jason", "MIL")],
      arriving: [arriving("Burnell, Jason Scott", "MIL", null)],
    });
    expect(proposals).toEqual([]);
  });

  it("refuses to choose when two arrivals both look like one player", () => {
    const { proposals } = proposeRenames({
      departing: [stored("Nunn, Kendrick", "PAN")],
      arriving: [
        arriving("Nunn, Kendrick Deshaun", "PAN", "111"),
        arriving("Nunn, Kendrick James", "PAN", "222"),
      ],
    });
    expect(proposals[0]!.confidence).toBe("candidate");
    expect(proposals[0]!.reason).toContain("2 arrivals");
    expect(proposals[0]!.alternatives).toHaveLength(2);
  });

  it("offers candidates for a nickname it cannot prove", () => {
    // The `Juzang, Johnny → Juzang, Jonathan` case. Quarantined and ranked, not
    // merged and not dropped.
    const { proposals, pairedIncoming } = proposeRenames({
      departing: [stored("Juzang, Johnny", "ULK")],
      arriving: [
        arriving("Juzang, Jonathan", "ULK", "014733"),
        arriving("Osmani, Ercan", "ULK", "014999"),
      ],
    });

    expect(proposals).toHaveLength(1);
    expect(proposals[0]!.confidence).toBe("candidate");
    expect(proposals[0]!.reason).toContain("no part of the names matches");
    // Fuse ranks, and puts the right one first.
    expect(proposals[0]!.alternatives[0]!.name).toBe("Juzang, Jonathan");
    expect(proposals[0]!.alternatives).toHaveLength(2);
    // A candidate does not claim an arrival, so nothing is quarantined on the
    // strength of a guess — the arrival is still a real arrival if rejected.
    expect(pairedIncoming.size).toBe(0);
  });

  it("says nothing at all when a club has no unexplained arrival", () => {
    // A player who genuinely left. No arrival to confuse them with, so the
    // departure proceeds exactly as before 4.2.
    const { proposals } = proposeRenames({
      departing: [stored("Retired, Somebody", "ZAL")],
      arriving: [arriving("Newcomer, Fresh", "BAR")],
    });
    expect(proposals).toEqual([]);
  });

  it("does not put one arrival in two proposals", () => {
    // The bug this test found: in one pass, `Burnell, J` sorts first, matches
    // nothing by containment, and was offered the arrival as a *candidate* —
    // then `Burnell, Jason` matched the same arrival confidently, and the code
    // appeared in two proposals. Confirming both would write one person code
    // onto two players.
    const { proposals } = proposeRenames({
      departing: [stored("Burnell, Jason", "MIL"), stored("Burnell, J", "MIL")],
      arriving: [arriving("Burnell, Jason Scott", "MIL", "014782")],
    });

    expect(proposals.filter((p) => p.confidence === "likely")).toHaveLength(1);
    expect(proposals[0]!.existing.name).toBe("Burnell, Jason");
    expect(
      proposals.filter((p) => p.incoming.person_code === "014782"),
    ).toHaveLength(1);
  });

  it("finds the confident pair even when a weaker one sorts first", () => {
    // Same shape, stated as the property rather than as the defect: the pass
    // order must not depend on ids.
    const { proposals } = proposeRenames({
      departing: [stored("Aaa, Nobody", "MIL"), stored("Gueye, Mo", "MIL")],
      arriving: [arriving("Gueye, Mouhamadou", "MIL", "014739")],
    });
    const likely = proposals.filter((p) => p.confidence === "likely");
    expect(likely).toHaveLength(1);
    expect(likely[0]!.existing.name).toBe("Gueye, Mo");
    // And the other stored player is not offered an arrival that is spoken for.
    expect(proposals.filter((p) => p.existing.name === "Aaa, Nobody")).toEqual(
      [],
    );
  });

  it("is deterministic across runs", () => {
    const departing = [
      stored("Cardenas, Alvaro", "PAM"),
      stored("Gueye, Mo", "PAR"),
      stored("Bello, Rasheed", "PAR"),
    ];
    const incoming = [
      arriving("Gueye, Mouhamadou", "PAR", "1"),
      arriving("Bello, Abdulrasheed Olamilekan", "PAR", "2"),
      arriving("Cardenas Torre, Alvaro", "PAM", "3"),
    ];
    const once = proposeRenames({ departing, arriving: incoming });
    const twice = proposeRenames({
      departing: [...departing].reverse(),
      arriving: [...incoming].reverse(),
    });
    const key = (result: ReturnType<typeof proposeRenames>) =>
      result.proposals
        .map((p) => `${p.existing.id}->${p.incoming.person_code}`)
        .sort()
        .join("|");
    expect(key(once)).toBe(key(twice));
  });

  it("handles the whole measured batch: 12 likely, 3 needing a person", () => {
    // The real 2026-09-08 shape, in one assertion, and the number that says
    // whether the rule is worth having: fifteen splits prevented, twelve of
    // them without asking anybody. Against the live feed the same rule turned
    // 18 adds and 22 departures into 7 and 11.
    const departing = [...REAL_PAIRS, ...NICKNAME_PAIRS].map(([name], index) =>
      stored(name, `C${index}`),
    );
    const incoming = [...REAL_PAIRS, ...NICKNAME_PAIRS].map(
      ([, name], index) => arriving(name, `C${index}`, String(index)),
    );

    const { proposals } = proposeRenames({ departing, arriving: incoming });
    expect(proposals).toHaveLength(15);
    expect(proposals.filter((p) => p.confidence === "likely")).toHaveLength(12);
    expect(proposals.filter((p) => p.confidence === "candidate")).toHaveLength(
      3,
    );
    // And every one of the fifteen is a distinct stored player.
    expect(new Set(proposals.map((p) => p.existing.id)).size).toBe(15);
  });
});
