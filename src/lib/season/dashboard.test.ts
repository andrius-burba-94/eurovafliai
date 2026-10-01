import { describe, expect, it } from "vitest";

import { dashboardStandings, liveRound, seasonLabel } from "./dashboard";

const TEAMS = { a: "Virtuozas", b: "Vafliai", c: "Krosas" };

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
    expect(rows[0]!.roundHundredths).toBe(42);
    // Played and scored nothing is a real fact, and it is zero.
    expect(rows[1]!.roundHundredths).toBe(0);
  });

  // The distinction the panel rests on: no previous round is not a blank round.
  it("has no movement at all on the first counted round", () => {
    const rows = dashboardStandings({
      totals: { a: 420 },
      previous: null,
      teamNames: TEAMS,
      youMemberId: null,
    });
    expect(rows[0]!.roundHundredths).toBeNull();
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
    expect(rows.find((row) => row.memberId === "b")!.roundHundredths).toBeNull();
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

describe("liveRound", () => {
  const round = (n: number, started: boolean) => ({ round: n, started, played: 4, total: 10 });

  it("is the started round after the last finished one", () => {
    expect(liveRound({ complete: [1, 2], lastComplete: 2, current: round(3, true) })).toEqual(round(3, true));
    expect(liveRound({ complete: [], lastComplete: null, current: round(1, true) })).toEqual(round(1, true));
  });

  it("is nothing between rounds or after the season", () => {
    expect(liveRound({ complete: [1, 2], lastComplete: 2, current: round(3, false) })).toBeNull();
    expect(liveRound({ complete: [1, 2], lastComplete: 2, current: null })).toBeNull();
  });

  it("does not bring back a round held open by a postponed game", () => {
    expect(liveRound({ complete: [1, 3, 4], lastComplete: 4, current: round(2, true) })).toBeNull();
  });
});
