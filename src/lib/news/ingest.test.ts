import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it, vi } from "vitest";

import type PocketBase from "pocketbase";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import { ingestNews, summariseNews } from "./ingest";

/**
 * The pass, end to end against the strict fake and the saved markup.
 *
 * The property this file is really about is that a **second pass changes
 * nothing**: the worker runs this hourly against pages that move a few times a
 * week, so a pass that stored or re-flagged anything on re-read would fill the
 * table and undo every correction somebody made.
 */

const HERE = dirname(fileURLToPath(import.meta.url));
const injuries = readFileSync(
  join(HERE, "fixtures/rotowire-injuries.html"),
  "utf8",
);
const news = readFileSync(join(HERE, "fixtures/rotowire-news.html"), "utf8");

const serve = () =>
  vi.fn(async (input: RequestInfo | URL) =>
    new Response(String(input).includes("view=injuries") ? injuries : news, {
      status: 200,
      headers: { "content-type": "text/html" },
    }),
  ) as unknown as typeof fetch;

/** Two of the pool's players are named on the pages; the rest are not. */
const pool = () => [
  {
    id: "p1",
    name: "Cordinier, Isaia",
    name_normalized: "cordinier isaia",
    club_code: "IST",
    status: "active",
  },
  {
    id: "p2",
    name: "Papagiannis, Georgios",
    name_normalized: "georgios papagiannis",
    club_code: "IST",
    status: "active",
  },
];

const NOW = () => new Date("2026-08-12T12:00:00Z");

describe("ingestNews", () => {
  it("stores both views' items and flags the players it recognises", async () => {
    const pb = fakePb({ data: { players: pool(), player_news: [] } });

    const report = await ingestNews({
      pb: pb.client as PocketBase,
      doFetch: serve(),
      now: NOW,
    });

    expect(report.read).toBe(12);
    expect(report.created).toBe(12);
    expect(report.problems).toEqual([]);

    // Both named players are hurt in the injuries view, and both items are
    // within the window of 12 August.
    expect(report.flagged).toBe(2);
    expect(pb.rows("players").map((player) => player.status)).toEqual([
      "injured",
      "injured",
    ]);

    // Everybody else on the pages is a name the pool cannot resolve, and every
    // one of them is stored rather than dropped.
    expect(report.unmatched).toBe(10);
    expect(pb.rows("player_news")).toHaveLength(12);
  });

  it("changes nothing on a second pass", async () => {
    const pb = fakePb({ data: { players: pool(), player_news: [] } });
    const doFetch = serve();

    await ingestNews({ pb: pb.client as PocketBase, doFetch, now: NOW });
    const writes = pb.writes.length;

    const again = await ingestNews({
      pb: pb.client as PocketBase,
      doFetch,
      now: NOW,
    });

    expect(again.created).toBe(0);
    expect(again.updated).toBe(0);
    expect(again.flagged).toBe(0);
    expect(again.unchanged).toBe(12);
    expect(pb.writes).toHaveLength(writes);
  });

  it("does not undo a correction on the next pass", async () => {
    const pb = fakePb({ data: { players: pool(), player_news: [] } });
    const doFetch = serve();

    await ingestNews({ pb: pb.client as PocketBase, doFetch, now: NOW });
    // The commissioner knows he played on Saturday.
    await pb.client
      .collection("players")
      .update("p1", { status: "active" }, { requestKey: null });

    const again = await ingestNews({
      pb: pb.client as PocketBase,
      doFetch,
      now: NOW,
    });

    expect(again.flagged).toBe(0);
    expect(pb.rows("players")[0].status).toBe("active");
  });

  it("flags nobody from items the window has passed", async () => {
    const pb = fakePb({ data: { players: pool(), player_news: [] } });

    const report = await ingestNews({
      pb: pb.client as PocketBase,
      doFetch: serve(),
      // Three months after the newest item on the saved pages.
      now: () => new Date("2026-11-20T12:00:00Z"),
    });

    expect(report.created).toBe(12);
    expect(report.flagged).toBe(0);
    expect(pb.rows("players").every((row) => row.status === "active")).toBe(true);
  });

  it("stores nothing and says why when neither page can be read", async () => {
    const pb = fakePb({ data: { players: pool(), player_news: [] } });

    const report = await ingestNews({
      pb: pb.client as PocketBase,
      doFetch: (async () =>
        new Response("nope", {
          status: 404,
          statusText: "Not Found",
        })) as unknown as typeof fetch,
      now: NOW,
    });

    expect(report.read).toBe(0);
    expect(report.created).toBe(0);
    expect(report.problems).toHaveLength(2);
    expect(pb.writes).toEqual([]);
  });
});

describe("summariseNews", () => {
  it("says what a pass did in one line", () => {
    expect(
      summariseNews({
        read: 25,
        created: 3,
        updated: 0,
        unchanged: 22,
        flagged: 1,
        unmatched: 2,
        problems: [],
      }),
    ).toBe("news · 25 item(s), 3 new, 1 flagged, 2 unmatched name(s)");
  });
});
