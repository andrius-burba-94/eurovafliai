import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakePb, type FakePb } from "../../../tests/unit/helpers/fake-pb";

vi.mock("server-only", () => ({}));

let fake: FakePb;
vi.mock("@/lib/pb/superuser", () => ({
  getSuperuserClient: async () => fake.client,
}));

const { ensureCommissionerMembership } = await import("./repair");

const LEAGUE = "league_1";
const COMMISSIONER = "user_chief";

/** `unique(league, user)`, as the migration declares it. */
const uniqueIndexes = { league_members: [["league", "user"]] };

describe("ensureCommissionerMembership", () => {
  beforeEach(() => {
    fake = fakePb({
      data: {
        leagues: [{ id: LEAGUE, commissioner: COMMISSIONER, status: "setup" }],
        league_members: [],
      },
      uniqueIndexes,
    });
  });

  it("creates the missing membership with an empty team name", async () => {
    await ensureCommissionerMembership(LEAGUE);
    expect(fake.rows("league_members")).toHaveLength(1);
    expect(fake.rows("league_members")[0]).toMatchObject({
      league: LEAGUE,
      user: COMMISSIONER,
      team_name: "",
      autodraft_enabled: false,
    });
  });

  it("writes nothing when the row is already there", async () => {
    await ensureCommissionerMembership(LEAGUE);
    await ensureCommissionerMembership(LEAGUE);
    expect(fake.rows("league_members")).toHaveLength(1);
    expect(fake.writes).toEqual(["create league_members"]);
  });

  it("treats losing the race to another repair as success", async () => {
    fake = fakePb({
      data: {
        leagues: [{ id: LEAGUE, commissioner: COMMISSIONER, status: "setup" }],
        league_members: [],
      },
      uniqueIndexes,
      hooks: {
        beforeCreate(collection, data) {
          if (collection === "league_members") {
            fake.rows("league_members").push({
              id: "theirs",
              league: data.league as string,
              user: data.user as string,
              team_name: "",
            });
          }
        },
      },
    });

    await expect(ensureCommissionerMembership(LEAGUE)).resolves.toBeUndefined();
    expect(fake.rows("league_members")).toHaveLength(1);
  });

  it("throws for a league that does not exist — there is nothing to repair", async () => {
    await expect(ensureCommissionerMembership("nope")).rejects.toThrow(
      /no leagues record/,
    );
  });
});
