import { describe, expect, it } from "vitest";

import { dashboardRoster, dashboardStandings, seasonLabel } from "./dashboard";

const TEAMS = { a: "Virtuozas", b: "Vafliai", c: "Krosas" };
const TEMPLATE = { G: 5, F: 5, C: 3 } as const;

describe("dashboardStandings", () => {
  it("ranks on the total, highest first", () => {
    const rows = dashboardStandings({
      totals: { a: 1000, b: 1284, c: 900 },
      previous: null,
      teamNames: TEAMS,
      youMemberId: null,
    });
    expect(rows.map((row) => row.teamName)).toEqual([
      "Vafliai",
      "Virtuozas",
      "Krosas",
    ]);
    expect(rows.map((row) => row.position)).toEqual([1, 2, 3]);
  });

  // Two members level on points must not swap places between two renders of
  // the same table, which is what an unstable comparator does.
  it("breaks a tie on team name, so the table does not shuffle", () => {
    const once = dashboardStandings({
      totals: { a: 500, b: 500, c: 500 },
      previous: null,
      teamNames: TEAMS,
      youMemberId: null,
    });
    const again = dashboardStandings({
      totals: { c: 500, b: 500, a: 500 },
      previous: null,
      teamNames: TEAMS,
      youMemberId: null,
    });
    expect(once.map((row) => row.teamName)).toEqual(
      again.map((r) => r.teamName),
    );
    expect(once.map((row) => row.teamName)).toEqual([
      "Krosas",
      "Vafliai",
      "Virtuozas",
    ]);
  });

  it("carries the movement since the previous round", () => {
    const rows = dashboardStandings({
      totals: { a: 1000, b: 900 },
      previous: { a: 958, b: 900 },
      teamNames: TEAMS,
      youMemberId: null,
    });
    expect(rows[0]!.roundTenths).toBe(42);
    // Played and scored nothing is a real fact, and it is zero.
    expect(rows[1]!.roundTenths).toBe(0);
  });

  // The distinction the panel rests on: no previous round is not a blank round.
  it("has no movement at all on the first counted round", () => {
    const rows = dashboardStandings({
      totals: { a: 420 },
      previous: null,
      teamNames: TEAMS,
      youMemberId: null,
    });
    expect(rows[0]!.roundTenths).toBeNull();
  });

  it("does not print a whole season as one round's movement for a late arrival", () => {
    // `b` was not in the previous snapshot. Subtracting nothing would have
    // credited them their entire total as this round's work.
    const rows = dashboardStandings({
      totals: { a: 1000, b: 640 },
      previous: { a: 958 },
      teamNames: TEAMS,
      youMemberId: null,
    });
    expect(rows.find((row) => row.memberId === "b")!.roundTenths).toBeNull();
  });

  it("marks the viewer's own row", () => {
    const rows = dashboardStandings({
      totals: { a: 1, b: 2 },
      previous: null,
      teamNames: TEAMS,
      youMemberId: "a",
    });
    expect(rows.find((row) => row.isYou)!.memberId).toBe("a");
    expect(rows.filter((row) => row.isYou)).toHaveLength(1);
  });

  it("falls back rather than dropping a member with no team name", () => {
    const rows = dashboardStandings({
      totals: { ghost: 10 },
      previous: null,
      teamNames: {},
      youMemberId: null,
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.teamName).toBe("Unnamed team");
  });

  it("is empty for a league with nothing scored", () => {
    expect(
      dashboardStandings({
        totals: {},
        previous: null,
        teamNames: TEAMS,
        youMemberId: null,
      }),
    ).toEqual([]);
  });
});

describe("dashboardRoster", () => {
  const player = (id: string, position: "G" | "F" | "C", name = id) => ({
    id,
    name,
    clubCode: "BAR",
    position,
    last5Pirs: [],
  });

  it("groups into guards, forwards and centers, in that order", () => {
    const groups = dashboardRoster(
      [player("p1", "C"), player("p2", "G"), player("p3", "F")],
      TEMPLATE,
    );
    expect(groups.map((group) => group.position)).toEqual(["G", "F", "C"]);
    expect(groups.map((group) => group.label)).toEqual([
      "Guards",
      "Forwards",
      "Centers",
    ]);
  });

  // Board-Shows-Its-Shape: the template is the shape of the thing, so a group
  // with nobody in it is the one worth drawing.
  it("keeps an empty group rather than dropping it", () => {
    const groups = dashboardRoster([player("p1", "G")], TEMPLATE);
    const centers = groups.find((group) => group.position === "C")!;
    expect(centers.filled).toBe(0);
    expect(centers.of).toBe(3);
    expect(centers.players).toEqual([]);
  });

  it("counts filled against the template, per position", () => {
    const groups = dashboardRoster(
      [player("p1", "G"), player("p2", "G"), player("p3", "C")],
      TEMPLATE,
    );
    expect(groups.map((group) => `${group.filled}/${group.of}`)).toEqual([
      "2/5",
      "0/5",
      "1/3",
    ]);
  });

  it("orders players within a group by name", () => {
    const groups = dashboardRoster(
      [
        player("p1", "G", "Zzz"),
        player("p2", "G", "Aaa"),
        player("p3", "G", "Mmm"),
      ],
      TEMPLATE,
    );
    expect(groups[0]!.players.map((p) => p.name)).toEqual([
      "Aaa",
      "Mmm",
      "Zzz",
    ]);
  });

  // The template is league settings, never hardcoded (PRODUCT.md).
  it("follows a template that is not 5/5/3", () => {
    const groups = dashboardRoster([player("p1", "G")], { G: 4, F: 4, C: 3 });
    expect(groups.map((group) => group.of)).toEqual([4, 4, 3]);
  });

  it("draws all three groups for an empty roster", () => {
    const groups = dashboardRoster([], TEMPLATE);
    expect(groups).toHaveLength(3);
    expect(groups.every((group) => group.filled === 0)).toBe(true);
  });
});

describe("seasonLabel", () => {
  // Caught by looking at a render: the first version stripped the century with
  // a regex and printed "26", which is half the name of the competition.
  it("names both years of the season the league is playing", () => {
    expect(seasonLabel("E2026")).toBe("26-27");
    expect(seasonLabel("E2025")).toBe("25-26");
    expect(seasonLabel("2026")).toBe("26-27");
  });

  it("wraps the century rather than printing 99-100", () => {
    expect(seasonLabel("E2099")).toBe("99-00");
  });

  it("hands back anything it cannot read, rather than inventing a season", () => {
    expect(seasonLabel("not-a-season")).toBe("not-a-season");
  });
});
