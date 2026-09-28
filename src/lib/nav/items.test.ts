import { describe, expect, it } from "vitest";

import { navFor, tabsFor, type NavLeague } from "./items";

const league = (overrides: Partial<NavLeague> = {}): NavLeague => ({
  id: "L1",
  name: "Couch League",
  status: "setup",
  youMemberId: "M1",
  isCommissioner: false,
  canManage: false,
  rolled: false,
  ...overrides,
});

const keysOf = (input: Parameters<typeof navFor>[0], group: string) =>
  navFor(input)
    .find((entry) => entry.id === group)
    ?.items.map((item) => item.key) ?? [];

describe("navFor", () => {
  it("outside a league offers the global group only", () => {
    const groups = navFor({ isRosterManager: false });
    expect(groups.map((group) => group.id)).toEqual(["global"]);
    expect(groups[0]!.items.map((item) => item.key)).toEqual([
      "leagues",
      "pool",
      "news",
    ]);
  });

  it("adds the manage group for a roster manager", () => {
    expect(keysOf({ isRosterManager: true }, "manage")).toEqual([
      "mapping",
      "import-players",
      "import-stats",
    ]);
  });

  it("keeps League and Drafts as separate labelled sections", () => {
    const groups = navFor({ league: league(), isRosterManager: false });
    expect(groups[0]).toMatchObject({ id: "league", label: "League" });
    expect(groups[1]).toMatchObject({ id: "drafts", label: "Drafts" });
  });

  it("in setup, a member sees home and draft resources in their own section", () => {
    expect(keysOf({ league: league(), isRosterManager: false }, "league")).toEqual(
      ["league-home"],
    );
    expect(keysOf({ league: league(), isRosterManager: false }, "drafts")).toEqual(["sheet", "export"]);
  });

  it("offers the order only once it has been drawn", () => {
    expect(
      keysOf({ league: league({ rolled: true }), isRosterManager: false }, "drafts"),
    ).toContain("order");
  });

  it("while drafting, the room is offered and says it is live", () => {
    const item = navFor({
      league: league({ status: "drafting", rolled: true }),
      isRosterManager: false,
    }).find((group) => group.id === "drafts")!.items.find((entry) => entry.key === "draft");
    expect(item).toMatchObject({
      href: "/leagues/L1/draft",
      label: "Draft Room",
      note: "Live",
    });
  });

  it("in season, a member gets the season surfaces and their own team", () => {
    const keys = keysOf(
      { league: league({ status: "season", rolled: true }), isRosterManager: false },
      "league",
    );
    expect(keys).toEqual([
      "league-home",
      "team",
      "lineup",
      "matchday",
      "standings",
      "recap",
      "trades",
    ]);
    expect(keysOf({ league: league({ status: "season", rolled: true }), isRosterManager: false }, "drafts")).toEqual(["draft", "order", "sheet", "export"]);
    const team = navFor({
      league: league({ status: "season" }),
      isRosterManager: false,
    })[0]!.items.find((entry) => entry.key === "team");
    expect(team?.href).toBe("/leagues/L1/teams/M1");
  });

  it("the season's draft room remains available without a live badge", () => {
    const item = navFor({
      league: league({ status: "season" }),
      isRosterManager: false,
    }).find((group) => group.id === "drafts")!.items.find((entry) => entry.key === "draft");
    expect(item?.label).toBe("Draft Room");
    expect(item?.note).toBeUndefined();
  });

  it("shows trade history to members, with the recording action still manager gated", () => {
    const managed = (status: NavLeague["status"]) =>
      keysOf(
        { league: league({ status, canManage: true }), isRosterManager: true },
        "league",
      );
    expect(managed("season")).toContain("trades");
    expect(managed("drafting")).not.toContain("trades");
    expect(managed("complete")).toContain("trades");
    expect(
      keysOf({ league: league({ status: "season" }), isRosterManager: false }, "league"),
    ).toContain("trades");
  });

  it("a commissioner without a membership sees no member-only surface", () => {
    const keys = keysOf(
      {
        league: league({
          status: "season",
          youMemberId: null,
          isCommissioner: true,
          canManage: true,
        }),
        isRosterManager: true,
      },
      "league",
    );
    expect(keys).toEqual(["league-home", "trades"]);
    expect(keysOf({ league: league({ status: "season", youMemberId: null, isCommissioner: true, canManage: true }), isRosterManager: true }, "drafts")).toContain("draft");
  });
});

describe("tabsFor", () => {
  const tabKeys = (input: Parameters<typeof navFor>[0]) =>
    tabsFor(navFor(input)).map((item) => item.key);

  it("outside a league: leagues, pool, news, then the next available", () => {
    expect(tabKeys({ isRosterManager: false })).toEqual([
      "leagues",
      "pool",
      "news",
    ]);
    expect(tabKeys({ isRosterManager: true })).toEqual([
      "leagues",
      "pool",
      "news",
      "mapping",
    ]);
  });

  it("while drafting, the live room takes the second tab", () => {
    expect(
      tabKeys({ league: league({ status: "drafting" }), isRosterManager: false }),
    ).toEqual(["draft", "pool", "league-home", "sheet"]);
  });

  it("in season, the lineup replaces the room", () => {
    expect(
      tabKeys({ league: league({ status: "season" }), isRosterManager: false }),
    ).toEqual(["lineup", "pool", "matchday", "standings"]);
  });

  it("always four tabs or fewer, never a duplicate", () => {
    for (const status of ["setup", "drafting", "season", "complete"] as const) {
      const keys = tabKeys({
        league: league({ status, rolled: true }),
        isRosterManager: true,
      });
      expect(keys.length).toBeLessThanOrEqual(4);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });
});
