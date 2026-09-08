import { describe, expect, it } from "vitest";

import {
  fakePb,
  type FakeHooks,
} from "../../../tests/unit/helpers/fake-pb";

import { recomputeStandings } from "./standings-store";

const SEASON = "E2026";

const stats = [
  {
    id: "s1",
    player: "p1",
    season: SEASON,
    round: 1,
    phase: "RS",
    fantasy_pts: 142,
  },
  {
    id: "s2",
    player: "p2",
    season: SEASON,
    round: 1,
    phase: "RS",
    fantasy_pts: 80,
  },
  {
    id: "s3",
    player: "p1",
    season: SEASON,
    round: 41,
    phase: "PO",
    fantasy_pts: 50,
  },
];

function seed(
  extra: Record<string, unknown[]> = {},
  hooks?: FakeHooks,
) {
  return fakePb({
    data: {
      leagues: [
        { id: "lg-season", status: "season" },
        { id: "lg-setup", status: "setup" },
      ],
      drafts: [
        {
          id: "draft-a",
          league: "lg-season",
          status: "complete",
          order: ["m-b"],
          rounds: 1,
        },
        {
          id: "draft-z",
          league: "lg-season",
          status: "complete",
          order: ["m-b", "m-a"],
          rounds: 1,
        },
        {
          id: "draft-setup",
          league: "lg-setup",
          status: "complete",
          order: ["m-x"],
          rounds: 1,
        },
      ],
      picks: [
        {
          id: "k1",
          draft: "draft-z",
          overall_no: 1,
          member: "m-b",
          player: "p1",
        },
        {
          id: "k2",
          draft: "draft-z",
          overall_no: 2,
          member: "m-a",
          player: "p2",
        },
        {
          id: "k-old",
          draft: "draft-a",
          overall_no: 1,
          member: "m-b",
          player: "p-wrong",
        },
        {
          id: "k-setup",
          draft: "draft-setup",
          overall_no: 1,
          member: "m-x",
          player: "p1",
        },
      ],
      player_game_stats: stats,
      standings_snapshots: [],
      roster_memberships: [],
      ...extra,
    },
    hooks,
  });
}

describe("recomputeStandings", () => {
  it("writes one snapshot per scored round for season leagues, repairing memberships from the newest complete draft", async () => {
    const { client, rows } = seed();
    const report = await recomputeStandings(client, SEASON);
    expect(report.leagues).toBe(1);
    expect(report.written).toBe(2);
    const snaps = rows("standings_snapshots");
    expect(snaps).toHaveLength(2);
    const rs = snaps.find((row) => row.round === 1);
    expect(rs?.phase).toBe("RS");
    const table = rs?.table as { memberId: string; roundTenths: number }[];
    expect(table[0]).toMatchObject({ memberId: "m-b", roundTenths: 142 });
    expect(snaps.some((row) => row.league === "lg-setup")).toBe(false);
    expect(rows("roster_memberships")).toHaveLength(2);
  });

  it("scores the active memberships, not the picks, once windows exist", async () => {
    const { client, rows } = seed(
      {
        roster_memberships: [
          {
            id: "rm1",
            league: "lg-season",
            member: "m-a",
            player: "p1",
            acquired_via: "draft",
          },
          {
            id: "rm2",
            league: "lg-season",
            member: "m-b",
            player: "p2",
            acquired_via: "draft",
          },
        ],
      },
      {
        beforeList(collection) {
          if (collection === "picks") {
            throw new Error("a complete membership set must not reread picks");
          }
        },
      },
    );
    await recomputeStandings(client, SEASON);
    const rs = rows("standings_snapshots").find((row) => row.round === 1);
    const table = rs?.table as { memberId: string; roundTenths: number }[];
    expect(table[0]).toMatchObject({ memberId: "m-a", roundTenths: 142 });
    expect(table[1]).toMatchObject({ memberId: "m-b", roundTenths: 80 });
  });

  it("does not reopen a closed window from the draft's picks", async () => {
    const { client, rows } = seed({
      roster_memberships: [
        {
          id: "open",
          league: "lg-season",
          member: "m-b",
          player: "p1",
          acquired_via: "draft",
        },
        {
          id: "closed",
          league: "lg-season",
          member: "m-a",
          player: "p2",
          to_date: "2026-09-01 12:00:00.000Z",
          acquired_via: "trade",
        },
      ],
    });
    await recomputeStandings(client, SEASON);
    expect(rows("roster_memberships")).toHaveLength(2);
    const rs = rows("standings_snapshots").find((row) => row.round === 1);
    const table = rs?.table as { memberId: string; roundTenths: number }[];
    expect(table).toHaveLength(1);
    expect(table[0]).toMatchObject({ memberId: "m-b", roundTenths: 142 });
  });

  it("is a no-op on a second pass", async () => {
    const { client } = seed();
    await recomputeStandings(client, SEASON);
    const again = await recomputeStandings(client, SEASON);
    expect(again.written).toBe(0);
    expect(again.unchanged).toBe(2);
  });
});
