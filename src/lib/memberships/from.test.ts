import { describe, expect, it } from "vitest";

import { fromPicks, isActiveMembership } from "./from";

describe("fromPicks", () => {
  it("writes one draft membership per pick", () => {
    expect(
      fromPicks(
        [
          { memberId: "m-a", playerId: "p1" },
          { memberId: "m-b", playerId: "p2" },
        ],
        "lg1",
        "2026-09-08 12:00:00.000Z",
      ),
    ).toEqual([
      {
        league: "lg1",
        member: "m-a",
        player: "p1",
        from_date: "2026-09-08 12:00:00.000Z",
        acquired_via: "draft",
      },
      {
        league: "lg1",
        member: "m-b",
        player: "p2",
        from_date: "2026-09-08 12:00:00.000Z",
        acquired_via: "draft",
      },
    ]);
  });

  it("keeps the first owner when the same player is named twice", () => {
    const rows = fromPicks(
      [
        { memberId: "m-a", playerId: "p1" },
        { memberId: "m-b", playerId: "p1" },
      ],
      "lg1",
      "2026-09-08 12:00:00.000Z",
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.member).toBe("m-a");
  });
});

describe("isActiveMembership", () => {
  it("treats unset and empty as open", () => {
    expect(isActiveMembership("")).toBe(true);
    expect(isActiveMembership(null)).toBe(true);
    expect(isActiveMembership(undefined)).toBe(true);
    expect(isActiveMembership("2026-09-01 12:00:00.000Z")).toBe(false);
  });
});
