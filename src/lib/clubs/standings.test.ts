import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";
import round13 from "./fixtures/e2026-round13-standings.json";
import { fetchClubStandings, parseClubStandings, standingsRound, standingsUrl } from "./standings";
import { readClubStandings, upsertClubStandings } from "./standings-store";

describe("parseClubStandings", () => {
  it("reads the real round-13 table: twenty clubs in the official order", () => {
    const table = parseClubStandings(round13)!;
    expect(table).toHaveLength(20);
    expect(table[0]).toEqual({ code: "PAM", position: 1, played: 12, won: 9, lost: 3 });
    expect(table.find((club) => club.code === "ULK")).toEqual({ code: "ULK", position: 5, played: 12, won: 8, lost: 4 });
    expect(table.map((club) => club.position)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (const club of table) expect(club.won + club.lost).toBe(club.played);
  });

  it("is null for a round with no table yet, and for a payload it cannot read", () => {
    expect(parseClubStandings({ winner: null, teams: [] })).toBeNull();
    expect(parseClubStandings({ winner: null, teams: null })).toBeNull();
    expect(parseClubStandings("<html>")).toBeNull();
  });

  it("skips a malformed club rather than refusing the table", () => {
    const teams = [...round13.teams.slice(0, 2), { position: "x" }];
    expect(parseClubStandings({ teams })?.map((club) => club.code)).toEqual(["PAM", "OLY"]);
  });
});

describe("standingsRound", () => {
  const at = (iso: string) => Date.parse(iso);
  const fixtures = [
    { round: 12, utc_date: "2026-11-13T19:00:00Z" },
    { round: 13, utc_date: "2026-11-19T18:00:00Z" },
    { round: 14, utc_date: "2026-11-26T18:00:00Z" },
  ];

  it("is the latest round with a game already tipped off", () => {
    expect(standingsRound(fixtures, at("2026-11-19T18:30:00Z"))).toBe(13);
    expect(standingsRound(fixtures, at("2026-11-19T17:59:00Z"))).toBe(12);
  });

  it("is null before the season's first tip-off", () => {
    expect(standingsRound(fixtures, at("2026-10-01T00:00:00Z"))).toBeNull();
    expect(standingsRound([{ round: 1, utc_date: null }], at("2026-11-19T00:00:00Z"))).toBeNull();
  });
});

describe("fetchClubStandings", () => {
  it("asks the v3 table for the round and parses it", async () => {
    const asked: string[] = [];
    const doFetch = (async (url: string) => {
      asked.push(url);
      return new Response(JSON.stringify(round13), { status: 200 });
    }) as typeof fetch;
    const table = await fetchClubStandings("E2026", 13, doFetch);
    expect(asked).toEqual([standingsUrl("E2026", 13)]);
    expect(asked[0]).toContain("/v3/competitions/E/seasons/E2026/rounds/13/basicstandings");
    expect(table?.[19]).toMatchObject({ code: "BAS", position: 20, won: 1, lost: 12 });
  });
});

describe("upsertClubStandings", () => {
  const table = parseClubStandings(round13)!;

  it("keeps one row per season: creates, then updates, and leaves an unchanged table alone", async () => {
    const pb = fakePb({ data: { club_standings: [] } });
    expect(await upsertClubStandings(pb.client, { season: "E2026", round: 12, clubs: table, checkedAt: "2026-11-19T20:00:00Z" })).toBe("created");
    expect(await upsertClubStandings(pb.client, { season: "E2026", round: 13, clubs: table, checkedAt: "2026-11-19T20:10:00Z" })).toBe("updated");
    expect(await upsertClubStandings(pb.client, { season: "E2026", round: 13, clubs: table, checkedAt: "2026-11-19T20:20:00Z" })).toBe("unchanged");
    expect(pb.rows("club_standings")).toHaveLength(1);
    expect(pb.rows("club_standings")[0]).toMatchObject({ round: 13, checked_at: "2026-11-19T20:10:00Z" });
  });

  it("updates the row another pass created between the read and the write", async () => {
    const pb = fakePb({
      data: { club_standings: [] },
      hooks: {
        beforeCreate(collection) {
          if (collection === "club_standings" && pb.rows("club_standings").length === 0) {
            pb.rows("club_standings").push({ id: "raced", season: "E2026", round: 12, clubs: [], checked_at: "2026-11-19T19:00:00Z" });
          }
        },
      },
    });
    expect(await upsertClubStandings(pb.client, { season: "E2026", round: 13, clubs: table, checkedAt: "2026-11-19T20:00:00Z" })).toBe("updated");
    expect(pb.rows("club_standings")).toHaveLength(1);
    expect(pb.rows("club_standings")[0]).toMatchObject({ id: "raced", round: 13 });
  });

  it("reads back as club code → line, and as nothing before any table is stored", async () => {
    const pb = fakePb({ data: { club_standings: [] } });
    expect((await readClubStandings(pb.client, "E2026")).size).toBe(0);
    await upsertClubStandings(pb.client, { season: "E2026", round: 13, clubs: table, checkedAt: "2026-11-19T20:00:00Z" });
    const read = await readClubStandings(pb.client, "E2026");
    expect(read.get("MIL")).toEqual({ code: "MIL", position: 19, played: 12, won: 2, lost: 10 });
  });
});
