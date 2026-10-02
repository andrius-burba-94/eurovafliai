import { describe, expect, it } from "vitest";

import { leagueHref, leaguePaths, playerHref, teamHref } from "./urls";

const league = { id: "s7bq8d0rndsrzx5", slug: "kavos-lyga" };
const team = { id: "e5n7nn3xhghfv9c", slug: "monikutes-naktys" };

describe("addresses", () => {
  it("names a league and its pages by slug", () => {
    expect(leagueHref(league)).toBe("/l/kavos-lyga");
    expect(leagueHref(league, "standings")).toBe("/l/kavos-lyga/standings");
    expect(leagueHref(league, "transactions", "new")).toBe("/l/kavos-lyga/transactions/new");
  });

  it("puts a team directly under its league", () => {
    expect(teamHref(league, team)).toBe("/l/kavos-lyga/monikutes-naktys");
  });

  it("puts a player under the league when there is one", () => {
    expect(playerHref({ id: "p1", slug: "nikola-milutinov" }, league)).toBe("/l/kavos-lyga/players/nikola-milutinov");
    expect(playerHref({ id: "p1", slug: "nikola-milutinov" })).toBe("/players/nikola-milutinov");
  });

  it("falls back to the id for a record that has no slug yet", () => {
    expect(leagueHref({ id: league.id, slug: "" })).toBe(`/l/${league.id}`);
    expect(teamHref(league.id, { id: team.id })).toBe(`/l/${league.id}/${team.id}`);
    expect(playerHref("p1")).toBe("/players/p1");
  });

  it("hands a page's client components every team's address", () => {
    expect(leaguePaths(league, [team, { id: "x" }])).toEqual({
      base: "/l/kavos-lyga",
      teams: { [team.id]: "/l/kavos-lyga/monikutes-naktys", x: "/l/kavos-lyga/x" },
    });
  });
});
