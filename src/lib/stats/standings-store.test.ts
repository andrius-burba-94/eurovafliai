import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import { recomputeStandings } from "./standings-store";

const SEASON = "E2026";

function seed() {
  return fakePb({
    data: {
      leagues: [
        { id: "lg-season", status: "season" },
        { id: "lg-setup", status: "setup" },
      ],
      drafts: [
        { id: "draft-a", league: "lg-season", status: "complete" },
        { id: "draft-z", league: "lg-season", status: "complete" },
        { id: "draft-setup", league: "lg-setup", status: "complete" },
      ],
      picks: [
        { id: "k1", draft: "draft-z", member: "m-b", player: "p1" },
        { id: "k2", draft: "draft-z", member: "m-a", player: "p2" },
        { id: "k-old", draft: "draft-a", member: "m-b", player: "p-wrong" },
        { id: "k-setup", draft: "draft-setup", member: "m-x", player: "p1" },
      ],
      player_game_stats: [
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
      ],
      standings_snapshots: [],
    },
  });
}

describe("recomputeStandings", () => {
  it("writes one snapshot per scored round for season leagues, from the newest complete draft", async () => {
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
  });

  it("is a no-op on a second pass", async () => {
    const { client } = seed();
    await recomputeStandings(client, SEASON);
    const again = await recomputeStandings(client, SEASON);
    expect(again.written).toBe(0);
    expect(again.unchanged).toBe(2);
  });
});
