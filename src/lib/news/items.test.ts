import { describe, expect, it } from "vitest";

import {
  INJURY_WINDOW_DAYS,
  isRecent,
  itemKey,
  matchPlayer,
  planNewsImport,
  statusOf,
  type NewsPlayerRow,
  type StoredNewsItem,
} from "./items";
import type { ScrapedItem } from "./rotowire";

const NOW = new Date("2026-09-14T12:00:00Z");

const item = (over: Partial<ScrapedItem> = {}): ScrapedItem => ({
  slug: "isaia-cordinier-1103",
  name: "Isaia Cordinier",
  headline: "Continues to recover",
  url: "https://www.rotowire.com/euro/player/isaia-cordinier-1103",
  clubName: "Anadolu Efes Istanbul",
  position: "G",
  bodyPart: "Knee",
  published: "2026-09-10",
  injured: true,
  ...over,
});

const player = (over: Partial<NewsPlayerRow> = {}): NewsPlayerRow => ({
  id: "p1",
  name: "Cordinier, Isaia",
  name_normalized: "cordinier isaia",
  club_code: "IST",
  status: "active",
  ...over,
});

const plan = (input: {
  scraped?: ScrapedItem[];
  stored?: StoredNewsItem[];
  players?: NewsPlayerRow[];
  now?: Date;
}) =>
  planNewsImport({
    scraped: input.scraped ?? [item()],
    stored: input.stored ?? [],
    players: input.players ?? [player()],
    now: input.now ?? NOW,
  });

describe("statusOf", () => {
  it("reads the page's own marking and never the words", () => {
    // Both of these are on the injuries view. A keyword classifier would call
    // the first a transfer and the second a recovery; the page says both are
    // injury items, and the page is the source.
    expect(statusOf(item({ headline: "Jumps to Partizan" }))).toBe("injured");
    expect(statusOf(item({ headline: "Taking part in workouts" }))).toBe(
      "injured",
    );
    expect(
      statusOf(item({ headline: "Signs with ASVEL", injured: false })),
    ).toBe("");
  });
});

describe("itemKey", () => {
  it("separates two items about one player on one day", () => {
    const first = itemKey(item({ headline: "Sustains knee injury" }));
    const second = itemKey(item({ headline: "Out for the season" }));
    expect(first).not.toBe(second);
  });

  it("is stable across re-reads of the same item", () => {
    expect(itemKey(item())).toBe(itemKey(item()));
  });
});

describe("isRecent", () => {
  it("accepts today and the edge of the window", () => {
    expect(isRecent("2026-09-14", NOW)).toBe(true);
    expect(isRecent("2026-08-24", NOW)).toBe(true); // 21 days
  });

  it("refuses older items and unreadable dates", () => {
    expect(isRecent("2026-08-23", NOW)).toBe(false);
    expect(isRecent("", NOW)).toBe(false);
    expect(INJURY_WINDOW_DAYS).toBe(21);
  });

  it("refuses a date from the far future rather than trusting it", () => {
    expect(isRecent("2027-01-01", NOW)).toBe(false);
  });
});

describe("matchPlayer", () => {
  const bySlug = new Map<string, string>();

  it("folds diacritics and sorts tokens, like every other match here", () => {
    const musa = player({
      id: "p9",
      name: "Musa, Džanan",
      name_normalized: "dzanan musa",
    });
    expect(
      matchPlayer(item({ name: "Dzanan Musa" }), [musa], bySlug),
    ).toEqual({ matched: true, playerId: "p9" });
  });

  it("prefers a slug somebody has already answered", () => {
    // Even when the published name matches nobody: the answer was about the
    // person, not about this spelling of them.
    const answered = new Map([["isaia-cordinier-1103", "p42"]]);
    expect(
      matchPlayer(item({ name: "I. Cordinier" }), [player()], answered),
    ).toEqual({ matched: true, playerId: "p42" });
  });

  it("refuses to choose between two players of the same name", () => {
    const twins = [player({ id: "a" }), player({ id: "b", club_code: "BAR" })];
    expect(matchPlayer(item(), twins, bySlug)).toEqual({
      matched: false,
      reason: "several",
    });
  });

  it("reports a name nobody answers to", () => {
    expect(matchPlayer(item({ name: "Nobody Here" }), [player()], bySlug)).toEqual(
      { matched: false, reason: "nobody" },
    );
  });
});

describe("planNewsImport", () => {
  it("stores a new item and flags the player it is about", () => {
    const result = plan({});

    expect(result.creates).toHaveLength(1);
    expect(result.creates[0]).toMatchObject({
      source: "rotowire",
      player: "p1",
      body_part: "Knee",
      status: "injured",
      applied: true,
    });
    expect(result.statusChanges).toEqual([
      {
        playerId: "p1",
        playerName: "Cordinier, Isaia",
        from: "active",
        to: "injured",
        sourceKey: itemKey(item()),
        headline: "Continues to recover",
      },
    ]);
  });

  it("stores a transfer without touching anybody's status", () => {
    const result = plan({
      scraped: [item({ headline: "Signs with ASVEL", injured: false, bodyPart: "" })],
    });

    expect(result.creates[0]).toMatchObject({ status: "", applied: false });
    expect(result.statusChanges).toEqual([]);
  });

  it("does not flag from an item older than the window", () => {
    // The pages carry the latest 25 updates rather than a census, so a cold
    // first pass reads months of history. June's knee is not this week's news.
    const result = plan({ scraped: [item({ published: "2026-06-08" })] });

    expect(result.creates).toHaveLength(1);
    expect(result.creates[0].applied).toBe(false);
    expect(result.statusChanges).toEqual([]);
  });

  it("re-reading the same page changes nothing", () => {
    const stored: StoredNewsItem[] = [
      {
        id: "n1",
        source_key: itemKey(item()),
        slug: item().slug,
        player: "p1",
        applied: true,
        name: item().name,
        club_name: item().clubName,
        headline: item().headline,
        published: item().published,
        status: "injured",
        body_part: "Knee",
        position: "G",
        url: item().url,
      },
    ];

    const result = planNewsImport({
      scraped: [item()],
      stored,
      players: [player({ status: "injured" })],
      now: NOW,
    });

    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
    expect(result.unchanged).toBe(1);
    expect(result.statusChanges).toEqual([]);
  });

  it("never flags twice from one item, so a correction sticks", () => {
    // The commissioner has marked him fit; the item that flagged him is spent.
    const stored: StoredNewsItem[] = [
      {
        id: "n1",
        source_key: itemKey(item()),
        slug: item().slug,
        player: "p1",
        applied: true,
        name: item().name,
        headline: item().headline,
        published: item().published,
        status: "injured",
        body_part: "Knee",
        position: "G",
        url: item().url,
        club_name: item().clubName,
      },
    ];

    const result = planNewsImport({
      scraped: [item()],
      stored,
      players: [player({ status: "active" })],
      now: NOW,
    });

    expect(result.statusChanges).toEqual([]);
  });

  it("leaves a locked player alone", () => {
    const result = plan({ players: [player({ manual_lock: true })] });
    expect(result.statusChanges).toEqual([]);
    expect(result.creates[0].applied).toBe(false);
  });

  it("leaves a player marked as having left alone", () => {
    // Whether somebody is still in the competition is the roster sync's to
    // say. A publisher covering them is not a registration.
    const result = plan({ players: [player({ status: "left" })] });
    expect(result.statusChanges).toEqual([]);
  });

  it("does not re-flag a player who is already injured", () => {
    const result = plan({ players: [player({ status: "injured" })] });
    expect(result.statusChanges).toEqual([]);
  });

  it("flags once when two items name the same player", () => {
    const result = plan({
      scraped: [
        item({ headline: "Sustains knee injury" }),
        item({ headline: "Out with injury", published: "2026-09-11" }),
      ],
    });

    expect(result.creates).toHaveLength(2);
    expect(result.statusChanges).toHaveLength(1);
    expect(result.creates.filter((row) => row.applied)).toHaveLength(1);
  });

  it("reports a name nobody answers to, with its items counted", () => {
    const result = plan({
      scraped: [
        item({ slug: "nobody-1", name: "Nobody Here" }),
        item({
          slug: "nobody-1",
          name: "Nobody Here",
          headline: "Out with injury",
        }),
      ],
      players: [player()],
    });

    expect(result.unmatched).toEqual([
      {
        slug: "nobody-1",
        name: "Nobody Here",
        clubName: "Anadolu Efes Istanbul",
        items: 2,
        reason: "nobody",
      },
    ]);
    // Stored anyway, unattached: a dropped item is an injury nobody hears of.
    expect(result.creates).toHaveLength(2);
    expect(result.creates.every((row) => row.player === "")).toBe(true);
  });

  it("attaches an item stored before its name was answered", () => {
    const key = itemKey(item({ slug: "cordi-2", name: "I. Cordinier" }));
    const stored: StoredNewsItem[] = [
      {
        id: "n1",
        source_key: key,
        slug: "cordi-2",
        player: "",
        applied: false,
        name: "I. Cordinier",
        headline: item().headline,
        published: item().published,
        status: "injured",
        body_part: "Knee",
        position: "G",
        url: item().url,
        club_name: item().clubName,
      },
      // The answer, recorded on another item under the same slug.
      {
        id: "n2",
        source_key: "cordi-2|2026-09-01|older",
        slug: "cordi-2",
        player: "p1",
        applied: true,
        name: "I. Cordinier",
        headline: "Sat out",
        published: "2026-09-01",
        status: "injured",
        body_part: "Knee",
        position: "G",
        url: item().url,
        club_name: item().clubName,
      },
    ];

    const result = planNewsImport({
      scraped: [item({ slug: "cordi-2", name: "I. Cordinier" })],
      stored,
      players: [player()],
      now: NOW,
    });

    expect(result.updates).toEqual([
      { id: "n1", fields: { player: "p1", applied: true } },
    ]);
    expect(result.statusChanges).toHaveLength(1);
    expect(result.unmatched).toEqual([]);
  });

  it("rewrites an item the publisher edited in place", () => {
    const stored: StoredNewsItem[] = [
      {
        id: "n1",
        source_key: itemKey(item()),
        slug: item().slug,
        player: "p1",
        applied: true,
        name: item().name,
        headline: item().headline,
        published: item().published,
        status: "injured",
        body_part: "Undisclosed",
        position: "G",
        url: item().url,
        club_name: "Free Agent",
      },
    ];

    const result = planNewsImport({
      scraped: [item()],
      stored,
      players: [player({ status: "injured" })],
      now: NOW,
    });

    expect(result.updates).toEqual([
      { id: "n1", fields: { club_name: "Anadolu Efes Istanbul", body_part: "Knee" } },
    ]);
  });
});
