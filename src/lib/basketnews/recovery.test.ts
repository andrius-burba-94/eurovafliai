import { describe, expect, it } from "vitest";
import { fakePb } from "../../../tests/unit/helpers/fake-pb";
import { planSync, rostersAgree } from "@/lib/fantasy/plan";
import { markBasketNewsJob, PocketBaseBasketNewsRepository } from "./repository";

const NOW = new Date("2026-10-21T13:05:00Z");
const target = new Map([["a", ["y"]], ["b", ["x"]]]);
const seats = [{ id: "ax", member: "a", player: "x" }, { id: "by", member: "b", player: "y" }];
const plan = planSync({ round: 7, seats, target, source: "BasketNews", teamName: (id) => id, playerName: (id) => id });

describe("saved BasketNews roster intent", () => {
  for (const point of ["transaction", "close", "open", "verdict"] as const) {
    it(`resumes the exact trade after failure at ${point}, even without the source API`, async () => {
      let fail = true;
      const stop = () => { if (fail) { fail = false; throw new Error("interrupted"); } };
      const db = fakePb({ data: {
        leagues: [{ id: "league", basketnews_roster_round: 6 }],
        roster_memberships: seats.map((seat) => ({ ...seat, league: "league", from_round: 1, to_date: "" })),
        transactions: [], basketnews_roster_batches: [], chat_messages: [],
      }, hooks: {
        beforeCreate(collection) {
          if (point === "transaction" && collection === "transactions") stop();
          if (point === "open" && collection === "roster_memberships") stop();
        },
        beforeUpdate(collection) {
          if (point === "close" && collection === "roster_memberships") stop();
          if (point === "verdict" && collection === "basketnews_roster_batches") stop();
        },
      } });
      const repo = new PocketBaseBasketNewsRepository(db.client);
      await expect(repo.reconcile("league", "E2026", 7, target, plan.steps, NOW)).rejects.toThrow("interrupted");
      expect(db.rows("basketnews_roster_batches")[0]?.status).toBe("applying");
      await repo.resume("league");
      expect(rostersAgree(await repo.seats("league"), target)).toBe(true);
      expect(db.rows("basketnews_roster_batches")[0]?.status).toBe("applied");
      expect(db.rows("leagues")[0]?.basketnews_roster_round).toBe(7);
      expect(db.rows("transactions")).toHaveLength(1);
      const windows = db.rows("roster_memberships").length;
      await repo.resume("league");
      await repo.reconcile("league", "E2026", 7, target, plan.steps, NOW);
      expect(db.rows("roster_memberships")).toHaveLength(windows);
      expect(db.rows("transactions")).toHaveLength(1);
    });
  }

  it("keeps full diagnostics without overflowing PocketBase's 500-character message", async () => {
    const db = fakePb({ data: { fantasy_syncs: [{ id: "job" }] } });
    const warning = "A historic lineup does not rebuild its official score. ".repeat(20);
    await markBasketNewsJob(db.client, "job", { status: "applied", message: warning, diagnostics: [warning] });
    expect(String(db.rows("fantasy_syncs")[0]?.message)).toHaveLength(500);
    expect(db.rows("fantasy_syncs")[0]?.diagnostics).toEqual([warning]);
  });

  it("does not mark a journal applied when the stored owner differs from its target", async () => {
    const db = fakePb({ data: { leagues: [{ id: "league" }], roster_memberships: seats.map((seat) => ({ ...seat, league: "league", to_date: "" })), basketnews_roster_batches: [] } });
    const repo = new PocketBaseBasketNewsRepository(db.client);
    await expect(repo.reconcile("league", "E2026", 7, target, [], NOW)).rejects.toThrow("incomplete");
    expect(db.rows("basketnews_roster_batches")[0]?.status).toBe("applying");
  });
});
