import { describe, expect, it } from "vitest";

import {
  codesWorthChasing,
  newestCheckBatch,
  pendingCodes,
  pendingRenames,
  queueSentence,
  queueTotal,
  type CodeBatch,
  type PoolPlayerRow,
  type RenameBatch,
} from "./queue";

/**
 * The doorbell's arithmetic — the count that chases 4.2's quarantine.
 *
 * The property under test throughout is that a *resolved* question stops being
 * counted. A queue that keeps reporting work somebody has already done is the
 * failure this slice exists to prevent: the notice gets ignored, and then the
 * real fifteen are ignored with it.
 */

const player = (over: Partial<PoolPlayerRow> = {}): PoolPlayerRow => ({
  id: "p1",
  name: "Burnell, Jason",
  club_code: "MIL",
  ...over,
});

const checkBatch = (
  renames: NonNullable<RenameBatch["diff"]>["renames"],
  over: Partial<RenameBatch> = {},
): RenameBatch => ({
  id: "b1",
  created: "2026-09-14 10:00:00.000Z",
  diff: { renames },
  ...over,
});

const proposal = {
  existing: { id: "p1", name: "Burnell, Jason", club_code: "MIL" },
  incoming: { name: "Burnell, Jason Scott", person_code: "014782" },
  confidence: "likely" as const,
  reason: "every token of the stored name appears in the arrival",
  alternatives: [],
};

describe("newestCheckBatch", () => {
  it("skips sync batches that carry no renames", () => {
    const sync = checkBatch([], { id: "sync" });
    const check = checkBatch([proposal], { id: "check" });

    expect(newestCheckBatch([sync, check])?.id).toBe("check");
  });

  it("is undefined when nothing has ever been checked", () => {
    expect(newestCheckBatch([])).toBeUndefined();
  });
});

describe("pendingRenames", () => {
  it("keeps a proposal whose player is still codeless", () => {
    const open = pendingRenames(checkBatch([proposal]), [player()]);

    expect(open).toHaveLength(1);
    expect(open[0]).toMatchObject({
      existingId: "p1",
      incomingName: "Burnell, Jason Scott",
      personCode: "014782",
      confidence: "likely",
    });
  });

  it("drops a proposal whose player has since been given a code", () => {
    const answered = [player({ person_code: "014782" })];

    expect(pendingRenames(checkBatch([proposal]), answered)).toEqual([]);
  });

  it("drops a proposal whose code has since landed on somebody else", () => {
    const pool = [player(), player({ id: "p2", person_code: "014782" })];

    expect(pendingRenames(checkBatch([proposal]), pool)).toEqual([]);
  });

  it("drops a proposal whose player has left the pool entirely", () => {
    expect(pendingRenames(checkBatch([proposal]), [])).toEqual([]);
  });

  it("ignores a half-written proposal rather than counting it", () => {
    const broken = checkBatch([
      { existing: { id: "p1" }, incoming: { name: "No code here" } },
    ]);

    expect(pendingRenames(broken, [player()])).toEqual([]);
  });

  it("is empty for no batch at all", () => {
    expect(pendingRenames(undefined, [player()])).toEqual([]);
  });
});

const codeBatch = (
  unmatched: NonNullable<CodeBatch["plan"]>["unmatched"],
  over: Partial<CodeBatch> = {},
): CodeBatch => ({
  id: "s1",
  season: "E2026",
  created: "2026-09-25 22:30:00.000Z",
  plan: { unmatched },
  ...over,
});

describe("pendingCodes", () => {
  it("counts one code once across the passes that met it", () => {
    const batches = [
      codeBatch([{ personCode: "99", lines: [3], name: "Doe", clubCode: "ULK" }], { id: "s2" }),
      codeBatch([{ personCode: "99", lines: [1, 2], name: "Doe", clubCode: "ULK" }]),
    ];

    const open = pendingCodes(batches, []);

    expect(open).toHaveLength(1);
    // The union, so attaching the code re-imports every game it was seen in.
    expect(open[0].games).toEqual([1, 2, 3]);
  });

  it("drops a code somebody has since attached", () => {
    const batches = [codeBatch([{ personCode: "99", lines: [1] }])];

    expect(pendingCodes(batches, [player({ person_code: "99" })])).toEqual([]);
  });

  it("ignores an entry with no code", () => {
    expect(pendingCodes([codeBatch([{ lines: [1] }])], [])).toEqual([]);
  });
});

describe("codesWorthChasing", () => {
  const codes = [
    { personCode: "1", name: null, clubCode: null, games: [], season: "E2026" },
    { personCode: "2", name: null, clubCode: null, games: [], season: "E2025" },
    { personCode: "3", name: null, clubCode: null, games: [], season: "E2025" },
  ];

  /**
   * The measurement this rule came from: a full E2025 backfill against an
   * E2026 pool leaves 123 unmatched codes and **none of them is work** — they
   * are players who left the league. Counting them would have opened the
   * doorbell on a hundred things nobody can act on.
   */
  it("keeps only the season being played", () => {
    expect(codesWorthChasing(codes, "E2026").map((c) => c.personCode)).toEqual([
      "1",
    ]);
  });

  it("counts nothing when the whole queue is last season's", () => {
    expect(codesWorthChasing(codes.slice(1), "E2026")).toEqual([]);
  });
});

describe("queueSentence", () => {
  it("says nothing at all when nothing is standing", () => {
    expect(queueSentence({ renames: 0, codes: 0 })).toBeNull();
  });

  it("names the renames and what they cost", () => {
    const sentence = queueSentence({ renames: 15, codes: 0 });

    expect(sentence).toContain("15 players");
    expect(sentence).toContain("re-registered");
    expect(sentence).toContain("box scores cannot attach");
    expect(sentence).not.toContain("person code");
  });

  it("names the codes on their own", () => {
    const sentence = queueSentence({ renames: 0, codes: 3 });

    expect(sentence).toContain("3 person codes");
    expect(sentence).not.toContain("re-registered");
  });

  it("carries both halves when both are standing", () => {
    const sentence = queueSentence({ renames: 2, codes: 4 });

    expect(sentence).toContain("2 players");
    expect(sentence).toContain("4 person codes");
  });

  it("does not say '1 players'", () => {
    const sentence = queueSentence({ renames: 1, codes: 1 });

    expect(sentence).toContain("One player in the pool");
    expect(sentence).toContain("One person code");
    expect(sentence).not.toMatch(/\b1 (players|person codes)\b/);
  });
});

describe("queueTotal", () => {
  it("adds the two halves, because both block the same thing", () => {
    expect(queueTotal({ renames: 6, codes: 10 })).toBe(16);
  });
});
