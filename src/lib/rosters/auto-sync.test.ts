import { describe, expect, it } from "vitest";

import { fakePb, type FakeDb } from "../../../tests/unit/helpers/fake-pb";

import {
  readUnknownNames,
  ROSTER_SYNC_EVERY_MS,
  ROSTER_SYNC_MIN_GAP_MS,
  rosterSyncDue,
  syncRostersFromFeed,
} from "./auto-sync";

const NOW = new Date("2026-10-08T20:00:00Z");

describe("rosterSyncDue", () => {
  const base = { now: NOW.getTime(), unknown: [] as string[], seen: new Set<string>() };

  it("runs once at start, then on the schedule", () => {
    expect(rosterSyncDue({ ...base, lastRunAt: null }).due).toBe(true);
    expect(rosterSyncDue({ ...base, lastRunAt: base.now - ROSTER_SYNC_EVERY_MS + 1 }).due).toBe(false);
    expect(rosterSyncDue({ ...base, lastRunAt: base.now - ROSTER_SYNC_EVERY_MS })).toEqual({ due: true, reason: "scheduled" });
  });

  it("pulls a pass forward for a new unknown name, but not within the hour", () => {
    const unknown = ["code:014213"];
    expect(rosterSyncDue({ ...base, unknown, lastRunAt: base.now - ROSTER_SYNC_MIN_GAP_MS + 1 }).due).toBe(false);
    expect(rosterSyncDue({ ...base, unknown, lastRunAt: base.now - ROSTER_SYNC_MIN_GAP_MS }).due).toBe(true);
  });

  it("does not chase a name that stayed unknown after a pass", () => {
    const decision = rosterSyncDue({ ...base, unknown: ["news:george-papas"], seen: new Set(["news:george-papas"]), lastRunAt: base.now - 2 * ROSTER_SYNC_MIN_GAP_MS });
    expect(decision.due).toBe(false);
  });
});

function feedPlayer(code: string, name: string, dorsal: string) {
  return {
    person: { code, name, height: 190, weight: 90, birthDate: "1994-08-08T00:00:00", country: { code: "USA", name: "United States" } },
    type: "J",
    positionName: "Guard",
    dorsal,
    club: { code: "IST", name: "Anadolu Efes Istanbul" },
    season: { name: "EuroLeague 2026-27" },
  };
}

const LOYD = feedPlayer("009754", "LOYD, JORDAN", "1");
const PAYNE = feedPlayer("014213", "PAYNE, CAMERON", "15");

function serve(rows: unknown[]) {
  return (async (url: string | URL) => {
    const target = String(url);
    if (target.includes("limit=1000")) return Response.json({ data: rows });
    if (target.endsWith("/clubs")) return Response.json({ data: [{ code: "IST", name: "Anadolu Efes Istanbul" }] });
    return Response.json(rows);
  }) as unknown as typeof fetch;
}

/** The pool as one earlier sync of `rows` left it. */
async function poolFrom(rows: unknown[], extra: FakeDb = {}) {
  const fake = fakePb({ data: { app_settings: [{ id: "s", roster_authority: "api" }], players: [], ...extra } });
  await syncRostersFromFeed({ pb: fake.client, season: "E2026", now: NOW, doFetch: serve(rows), reimport: false });
  fake.db.roster_imports = [];
  return fake;
}

describe("syncRostersFromFeed", () => {
  it("adds a new signing, recovers his refused box-score lines and attaches his news", async () => {
    const fake = await poolFrom([LOYD], {
      stat_imports: [
        { id: "b1", season: "E2026", created: "2026-10-08 19:00:00.000Z", plan: { unmatched: [{ personCode: "014213", lines: [44, 41], name: "PAYNE, CAMERON", clubCode: "IST" }] } },
      ],
      player_news: [
        { id: "n1", source: "rotowire", slug: "cameron-payne", name: "Cameron Payne", club_name: "Anadolu Efes", headline: "Payne joins Efes", published: "2026-10-07", player: "" },
      ],
      leagues: [],
    });
    const reimported: number[][] = [];

    const report = await syncRostersFromFeed({
      pb: fake.client,
      season: "E2026",
      now: NOW,
      doFetch: serve([LOYD, PAYNE]),
      reimport: async (games) => {
        reimported.push([...games]);
        return games.length;
      },
    });

    expect(report).toMatchObject({ skipped: null, applied: true, added: ["Payne, Cameron"], reimportedLines: 2, newsAttached: 1 });
    expect(reimported).toEqual([[41, 44]]);
    const payne = fake.rows("players").find((row) => row.person_code === "014213");
    expect(payne).toBeDefined();
    expect(fake.rows("player_news")[0]?.player).toBe(payne?.id);
    expect(fake.rows("roster_imports")).toHaveLength(1);
  });

  it("stores nothing when the roster has not changed", async () => {
    const fake = await poolFrom([LOYD, PAYNE]);
    const report = await syncRostersFromFeed({ pb: fake.client, season: "E2026", now: NOW, doFetch: serve([LOYD, PAYNE]), reimport: false });
    expect(report.skipped).toBe("unchanged");
    expect(fake.rows("roster_imports")).toHaveLength(0);
  });

  it("refuses a feed that would empty the pool, writing nothing", async () => {
    const many = Array.from({ length: 8 }, (_, index) => feedPlayer(`10000${index}`, `PLAYER, NUMBER${index}`, String(index)));
    const fake = await poolFrom(many);
    const report = await syncRostersFromFeed({ pb: fake.client, season: "E2026", now: NOW, doFetch: serve([many[0]]), reimport: false });
    expect(report.skipped).toMatch(/^refused: it would mark 7 of 8/);
    expect(fake.rows("roster_imports")).toHaveLength(0);
    expect(fake.rows("players").every((row) => row.status === "active")).toBe(true);
  });

  it("only reports while the CSV holds authority", async () => {
    const fake = await poolFrom([LOYD]);
    fake.db.app_settings = [{ id: "s", roster_authority: "csv" }];
    const report = await syncRostersFromFeed({ pb: fake.client, season: "E2026", now: NOW, doFetch: serve([LOYD, PAYNE]), reimport: false });
    expect(report).toMatchObject({ applied: false, added: [] });
    expect(fake.rows("players").some((row) => row.person_code === "014213")).toBe(false);
  });
});

describe("readUnknownNames", () => {
  it("collects this season's codes, recent news names and fresh player questions from either ruleset", async () => {
    const { client } = fakePb({
      data: {
        players: [{ id: "p1", name: "Loyd, Jordan", club_code: "IST", person_code: "009754" }],
        stat_imports: [
          { id: "b1", season: "E2026", created: "2026-10-08 19:00:00.000Z", plan: { unmatched: [{ personCode: "014213", lines: [44] }, { personCode: "009754", lines: [40] }] } },
          { id: "b0", season: "E2025", created: "2026-09-01 19:00:00.000Z", plan: { unmatched: [{ personCode: "000001", lines: [1] }] } },
        ],
        player_news: [{ id: "n1", source: "rotowire", slug: "cameron-payne", name: "Cameron Payne", headline: "h", published: "2026-10-07", player: "" }],
        fantasy_syncs: [
          { id: "f1", league: "l1", status: "blocked", created: "2026-10-08 19:35:00.000Z", questions: [{ kind: "player", fantasyPlayerId: "8815", name: "Cameron Payne" }] },
          { id: "f0", league: "l1", status: "blocked", created: "2026-10-01 19:35:00.000Z", questions: [{ kind: "player", fantasyPlayerId: "1" }] },
        ],
      },
    });
    expect((await readUnknownNames(client, "E2026", NOW)).sort()).toEqual(["code:014213", "news:cameron-payne", "player:8815"]);
  });

  it("keeps this season's code when a backfill of last season imported after it", async () => {
    const backfill = Array.from({ length: 35 }, (_, index) => ({
      id: `old${index}`,
      season: "E2025",
      created: `2026-10-09 10:${String(index).padStart(2, "0")}:00.000Z`,
      plan: { unmatched: [{ personCode: `9${index}`, lines: [index] }] },
    }));
    const { client } = fakePb({
      data: {
        players: [],
        stat_imports: [
          { id: "b1", season: "E2026", created: "2026-10-08 19:00:00.000Z", plan: { unmatched: [{ personCode: "014213", lines: [44] }] } },
          ...backfill,
        ],
        player_news: [],
        fantasy_syncs: [],
      },
    });
    expect(await readUnknownNames(client, "E2026", NOW)).toEqual(["code:014213"]);
  });
});
