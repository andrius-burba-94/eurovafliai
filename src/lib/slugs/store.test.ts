import { describe, expect, it } from "vitest";

import { fakePb } from "../../../tests/unit/helpers/fake-pb";

import { ensureSlugs, newTeamSlug } from "./store";

const LEAGUE = "aaaaaaaaaaaaaa1";

function seed() {
  return fakePb({
    data: {
      leagues: [
        { id: LEAGUE, name: "Kavos lyga 26–27", slug: "", created: "1" },
        { id: "aaaaaaaaaaaaaa2", name: "Kavos lyga 26–27", slug: "", created: "2" },
      ],
      users: [{ id: "uuuuuuuuuuuuuu1", name: "Andrius" }],
      league_members: [
        { id: "mmmmmmmmmmmmmm1", league: LEAGUE, team_name: "Monikutės Naktys", user: "uuuuuuuuuuuuuu1", slug: "", created: "1" },
        { id: "mmmmmmmmmmmmmm2", league: LEAGUE, team_name: "Stats", user: "uuuuuuuuuuuuuu1", slug: "", created: "2" },
        { id: "mmmmmmmmmmmmmm3", league: LEAGUE, team_name: "", user: "uuuuuuuuuuuuuu1", slug: "", created: "3" },
        { id: "mmmmmmmmmmmmmm4", league: "aaaaaaaaaaaaaa2", team_name: "Monikutės Naktys", user: "uuuuuuuuuuuuuu1", slug: "", created: "4" },
      ],
      players: [
        { id: "ppppppppppppp01", name: "Milutinov, Nikola", club_code: "OLY", slug: "", created: "1" },
        { id: "ppppppppppppp02", name: "Milutinov, Nikola", club_code: "ZAL", slug: "", created: "2" },
        { id: "ppppppppppppp03", name: "Vezenkov, Alexander", club_code: "OLY", slug: "alexander-vezenkov", created: "3" },
      ],
    },
  });
}

describe("ensureSlugs", () => {
  it("gives every record a readable slug, unique where the indexes say", async () => {
    const pb = seed();
    const report = await ensureSlugs(pb.client);
    expect(report).toEqual({ leagues: 2, teams: 4, players: 2, failed: 0 });
    expect(pb.rows("leagues").map((row) => row.slug)).toEqual(["kavos-lyga-26-27", "kavos-lyga-26-27-2"]);
    expect(pb.rows("league_members").map((row) => row.slug)).toEqual([
      "monikutes-naktys",
      "stats-team",
      "andrius",
      "monikutes-naktys",
    ]);
    expect(pb.rows("players").map((row) => row.slug)).toEqual([
      "nikola-milutinov",
      "nikola-milutinov-zal",
      "alexander-vezenkov",
    ]);
  });

  it("writes nothing the second time", async () => {
    const pb = seed();
    await ensureSlugs(pb.client);
    const before = pb.writes.length;
    expect(await ensureSlugs(pb.client)).toEqual({ leagues: 0, teams: 0, players: 0, failed: 0 });
    expect(pb.writes.length).toBe(before);
  });
});

describe("newTeamSlug", () => {
  it("does not collide with the team's own old slug on a rename, or with its neighbours", async () => {
    const pb = seed();
    await ensureSlugs(pb.client);
    expect(await newTeamSlug(pb.client, LEAGUE, "Monikutės Naktys", "mmmmmmmmmmmmmm1")).toBe("monikutes-naktys");
    expect(await newTeamSlug(pb.client, LEAGUE, "Monikutės Naktys", "mmmmmmmmmmmmmm2")).toBe("monikutes-naktys-2");
    expect(await newTeamSlug(pb.client, LEAGUE, "Monikutės Naktys")).toBe("monikutes-naktys-2");
  });
});
