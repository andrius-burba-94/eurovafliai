import { describe, expect, it } from "vitest";

import {
  codesWorthChasing,
  newestCheckBatch,
  NEWS_CHASE_DAYS,
  newsWorthChasing,
  pendingCodes,
  pendingNewsNames,
  pendingRenames,
  queueSentence,
  queueTotal,
  type CodeBatch,
  type NewsItemRow,
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
    expect(queueSentence({ renames: 0, codes: 0, news: 0 })).toBeNull();
  });

  it("names the renames and what they cost", () => {
    const sentence = queueSentence({ renames: 15, codes: 0, news: 0 });

    expect(sentence).toContain("15 players");
    expect(sentence).toContain("re-registered");
    expect(sentence).toContain("box scores cannot attach");
    expect(sentence).not.toContain("person code");
  });

  it("names the codes on their own", () => {
    const sentence = queueSentence({ renames: 0, codes: 3, news: 0 });

    expect(sentence).toContain("3 person codes");
    expect(sentence).not.toContain("re-registered");
  });

  it("carries both halves when both are standing", () => {
    const sentence = queueSentence({ renames: 2, codes: 4, news: 0 });

    expect(sentence).toContain("2 players");
    expect(sentence).toContain("4 person codes");
  });

  it("does not say '1 players'", () => {
    const sentence = queueSentence({ renames: 1, codes: 1, news: 0 });

    expect(sentence).toContain("One player in the pool");
    expect(sentence).toContain("One person code");
    expect(sentence).not.toMatch(/\b1 (players|person codes)\b/);
  });

  it("names 9.4's cost rather than asserting the other two's", () => {
    // An unmatched news name does not stop a box score attaching — it stops an
    // injury being shown. Claiming otherwise would teach the reader to
    // disbelieve the sentence.
    const sentence = queueSentence({ renames: 0, codes: 0, news: 2 });

    expect(sentence).toContain("2 names in recent injury news");
    expect(sentence).toContain("show up nowhere");
    expect(sentence).not.toContain("box scores cannot attach");
  });

  it("names both costs when all three are standing", () => {
    const sentence = queueSentence({ renames: 1, codes: 1, news: 1 });

    expect(sentence).toContain("box scores cannot attach");
    expect(sentence).toContain("show up nowhere");
  });
});

describe("pendingNewsNames", () => {
  const news = (over: Partial<NewsItemRow> = {}): NewsItemRow => ({
    id: "n1",
    slug: "dzanan-musa-923",
    name: "Dzanan Musa",
    club_name: "Dubai Basketball",
    headline: "Sidelined with injury",
    published: "2026-09-10",
    url: "https://www.rotowire.com/euro/player/dzanan-musa-923",
    ...over,
  });

  it("groups unattached items by the publisher's slug", () => {
    const names = pendingNewsNames([
      news(),
      news({ id: "n2", headline: "Out with injury", published: "2026-09-12" }),
      news({ id: "n3", slug: "other-1", name: "Somebody Else" }),
    ]);

    expect(names).toHaveLength(2);
    expect(names[0]).toMatchObject({
      slug: "dzanan-musa-923",
      items: 2,
      latest: "2026-09-12",
      latestHeadline: "Out with injury",
    });
  });

  it("stops asking about a slug any item already answers", () => {
    // A half-applied answer is `attachSlug`'s job to finish, not a question to
    // ask again.
    const names = pendingNewsNames([
      news(),
      news({ id: "n2", player: "p1" }),
    ]);

    expect(names).toEqual([]);
  });

  it("counts nothing when every item found its player", () => {
    expect(pendingNewsNames([news({ player: "p1" })])).toEqual([]);
  });
});

describe("newsWorthChasing", () => {
  const name = (latest: string) => ({
    slug: `s-${latest}`,
    name: "Somebody",
    clubName: "",
    items: 1,
    latest,
    latestHeadline: "Out with injury",
    url: "",
  });

  /**
   * Same argument `codesWorthChasing` makes: a name from six weeks ago that
   * matched nobody is usually somebody this competition does not register, and
   * a doorbell that rings for those is a doorbell people stop hearing.
   */
  it("chases recent names and lets old ones go quiet", () => {
    const now = new Date("2026-09-14T12:00:00Z");
    const kept = newsWorthChasing(
      [name("2026-09-13"), name("2026-08-20"), name("2026-06-01")],
      now,
    );

    expect(kept.map((row) => row.latest)).toEqual(["2026-09-13", "2026-08-20"]);
    expect(NEWS_CHASE_DAYS).toBe(30);
  });

  it("lets an undated name go quiet rather than chasing it for ever", () => {
    expect(newsWorthChasing([name("")], new Date("2026-09-14"))).toEqual([]);
  });
});

describe("queueTotal", () => {
  it("adds all three, because each is a question only a person can answer", () => {
    expect(queueTotal({ renames: 6, codes: 10, news: 3 })).toBe(19);
  });
});
