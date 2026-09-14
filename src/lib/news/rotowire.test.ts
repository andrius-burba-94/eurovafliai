import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import {
  fetchRotowireNews,
  parseNewsDate,
  parseRotowire,
} from "./rotowire";

/**
 * The parser, against the markup the site actually served.
 *
 * `fixtures/*.html` are the first six blocks of each view, saved 2026-09-14,
 * byte for byte including their tabs and their inline links. That is the whole
 * point: a scraper tested against markup somebody wrote for the test proves
 * only that the test agrees with itself, and the failure mode this file exists
 * to catch is the site changing its class names.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const injuries = readFileSync(
  join(HERE, "fixtures/rotowire-injuries.html"),
  "utf8",
);
const news = readFileSync(join(HERE, "fixtures/rotowire-news.html"), "utf8");

describe("parseNewsDate", () => {
  it("reads the published form", () => {
    expect(parseNewsDate("August 6, 2026")).toBe("2026-08-06");
    expect(parseNewsDate("June 16, 2026")).toBe("2026-06-16");
    expect(parseNewsDate(" December 31, 2025 ")).toBe("2025-12-31");
  });

  it("returns empty rather than guessing at anything else", () => {
    // A wrong date sorts a stale injury to the top of the board; no date is
    // visible as "undated" and sorts last.
    for (const raw of ["2 hours ago", "Today", "6 August 2026", "Augus 6, 2026", ""]) {
      expect(parseNewsDate(raw)).toBe("");
    }
  });
});

describe("parseRotowire", () => {
  const items = parseRotowire(injuries);

  it("reads every block on the page", () => {
    expect(items).toHaveLength(7);
  });

  it("reads one item whole", () => {
    expect(items[0]).toEqual({
      slug: "isaia-cordinier-1103",
      name: "Isaia Cordinier",
      headline: "Continues to recover",
      url: "https://www.rotowire.com/euro/player/isaia-cordinier-1103",
      clubName: "Anadolu Efes Istanbul",
      position: "G",
      bodyPart: "Knee",
      published: "2026-08-06",
      injured: true,
    });
  });

  it("separates the club from the position letter glued to it", () => {
    // The meta cell is `<b class="news-update__pos">C</b>Panathinaikos …`, so a
    // naive text read makes every club name start with its own position.
    const lessort = items.find((item) => item.slug === "mathias-lessort-314");
    expect(lessort?.position).toBe("C");
    expect(lessort?.clubName).toBe("Panathinaikos AKTOR Athens");
  });

  it("keeps the publisher's prose out of what it returns", () => {
    // Every field is a fact or a link. The paragraph stays on their site — see
    // ADR-0007.
    for (const item of items) {
      expect(JSON.stringify(item)).not.toContain("according to");
      expect(JSON.stringify(item)).not.toContain("Subscribe");
    }
  });

  it("marks the plain view's transfer items as not injuries", () => {
    const plain = parseRotowire(news);
    const transfer = plain.find((item) => item.slug === "patty-mills-1606");
    expect(transfer).toMatchObject({
      name: "Patty Mills",
      headline: "Signs with ASVEL",
      bodyPart: "",
      injured: false,
    });

    // …while an injury item on the same page keeps its marking, which is what
    // makes reading both views safe.
    const hurt = plain.find((item) => item.slug === "isaia-cordinier-1103");
    expect(hurt?.injured).toBe(true);
    expect(hurt?.bodyPart).toBe("Knee");
  });

  it("returns nothing for markup with no blocks in it", () => {
    expect(parseRotowire("<main><p>Nothing here</p></main>")).toEqual([]);
  });
});

describe("fetchRotowireNews", () => {
  const ok = (body: string) =>
    new Response(body, { status: 200, headers: { "content-type": "text/html" } });

  it("reads both views and deduplicates the overlap", async () => {
    const doFetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("view=injuries") ? ok(injuries) : ok(news),
    );

    const { items, problems } = await fetchRotowireNews({
      doFetch: doFetch as unknown as typeof fetch,
    });

    expect(problems).toEqual([]);
    expect(doFetch).toHaveBeenCalledTimes(2);
    // Cordinier and Papagiannis are on both pages; fourteen blocks, twelve items.
    expect(items).toHaveLength(12);
    expect(
      items.filter((item) => item.slug === "isaia-cordinier-1103"),
    ).toHaveLength(1);
  });

  it("keeps the half it could read when one view fails", async () => {
    const doFetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).includes("view=injuries")
        ? ok(injuries)
        : new Response("gone", { status: 404, statusText: "Not Found" }),
    );

    const { items, problems } = await fetchRotowireNews({
      doFetch: doFetch as unknown as typeof fetch,
    });

    expect(items).toHaveLength(7);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("404");
  });

  it("says so when a view parses to nothing at all", async () => {
    const doFetch = vi.fn(async () => ok("<main><p>Redesigned</p></main>"));

    const { items, problems } = await fetchRotowireNews({
      doFetch: doFetch as unknown as typeof fetch,
      views: ["https://www.rotowire.com/euro/news.php"],
    });

    expect(items).toEqual([]);
    expect(problems[0]).toContain("markup has probably changed");
  });
});
