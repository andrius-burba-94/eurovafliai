import { describe, expect, it } from "vitest";

import { coversRound, fromPicks, isActiveMembership } from "./from";

describe("fromPicks", () => {
  it("writes one draft membership per pick, covering from round 1", () => {
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
        from_round: 1,
        acquired_via: "draft",
      },
      {
        league: "lg1",
        member: "m-b",
        player: "p2",
        from_date: "2026-09-08 12:00:00.000Z",
        from_round: 1,
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

describe("coversRound", () => {
  it("an open draft window owns every round", () => {
    expect(coversRound({ from_round: 1, to_round: 0, to_date: "" }, 1)).toBe(
      true,
    );
    expect(coversRound({ from_round: 1, to_round: 0, to_date: "" }, 38)).toBe(
      true,
    );
  });

  it("a trade at round 2 leaves round 1 with the old owner", () => {
    const closed = { from_round: 1, to_round: 2, to_date: "2026-09-09 12:00:00.000Z" };
    const opened = { from_round: 2, to_round: 0, to_date: "" };
    expect(coversRound(closed, 1)).toBe(true);
    expect(coversRound(closed, 2)).toBe(false);
    expect(coversRound(opened, 1)).toBe(false);
    expect(coversRound(opened, 2)).toBe(true);
  });

  it("a calendar-closed row with no to_round covers nothing", () => {
    expect(
      coversRound(
        { from_round: 1, to_round: 0, to_date: "2026-09-01 12:00:00.000Z" },
        1,
      ),
    ).toBe(false);
  });
});
