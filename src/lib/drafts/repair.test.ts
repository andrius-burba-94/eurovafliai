import { beforeEach, describe, expect, it, vi } from "vitest";

import { fakePb, type FakePb } from "../../../tests/unit/helpers/fake-pb";

/**
 * `reconcileLeagueStatus` is a repair that runs during a render, so it reaches
 * for the request-scoped superuser client itself rather than taking one. The
 * two modules that make it server-only are replaced here: `server-only` with
 * nothing, and the client factory with the strict fake.
 */
vi.mock("server-only", () => ({}));

let fake: FakePb;
vi.mock("@/lib/pb/superuser", () => ({
  getSuperuserClient: async () => fake.client,
}));

const { reconcileLeagueStatus } = await import("./repair");

const LEAGUE = "league_1";

function withDraft(status: "live" | "paused" | "complete", leagueStatus: string) {
  fake = fakePb({
    data: {
      leagues: [{ id: LEAGUE, status: leagueStatus }],
      drafts: [
        { id: "d_old", league: LEAGUE, status: "complete", created: "2026-09-01 10:00:00" },
        { id: "d_new", league: LEAGUE, status, created: "2026-09-02 10:00:00" },
      ],
    },
  });
}

describe("reconcileLeagueStatus", () => {
  beforeEach(() => {
    fake = fakePb({ data: {} });
  });

  it("does not read at all for a league that has never drafted", async () => {
    expect(await reconcileLeagueStatus(LEAGUE, "setup")).toBe("setup");
    expect(fake.writes).toEqual([]);
  });

  it("leaves an agreeing pair alone", async () => {
    withDraft("live", "drafting");
    expect(await reconcileLeagueStatus(LEAGUE, "drafting")).toBe("drafting");
    withDraft("complete", "season");
    expect(await reconcileLeagueStatus(LEAGUE, "season")).toBe("season");
    expect(fake.writes).toEqual([]);
  });

  it("moves the league to season when its newest draft is complete", async () => {
    withDraft("complete", "drafting");
    expect(await reconcileLeagueStatus(LEAGUE, "drafting")).toBe("season");
    expect(fake.rows("leagues")[0]?.status).toBe("season");
  });

  it("moves the league back to drafting when the newest draft is running again", async () => {
    // The newest draft decides, not the older complete one.
    withDraft("paused", "season");
    expect(await reconcileLeagueStatus(LEAGUE, "season")).toBe("drafting");
    expect(fake.rows("leagues")[0]?.status).toBe("drafting");
  });

  it("returns a drafting league with no draft to the lobby", async () => {
    fake = fakePb({
      data: { leagues: [{ id: LEAGUE, status: "drafting" }], drafts: [] },
    });
    expect(await reconcileLeagueStatus(LEAGUE, "drafting")).toBe("setup");
    expect(fake.rows("leagues")[0]?.status).toBe("setup");
  });

  it("never guesses a season league with no draft back to the lobby", async () => {
    fake = fakePb({
      data: { leagues: [{ id: LEAGUE, status: "season" }], drafts: [] },
    });
    expect(await reconcileLeagueStatus(LEAGUE, "season")).toBe("season");
    expect(fake.writes).toEqual([]);
  });

  it("still reports the state that should hold when the write is lost", async () => {
    withDraft("complete", "drafting");
    // The league row is gone from under us: the update throws, the repair
    // swallows it and the caller renders the truth rather than the stale read.
    fake.db.leagues = [];
    expect(await reconcileLeagueStatus(LEAGUE, "drafting")).toBe("season");
  });
});
