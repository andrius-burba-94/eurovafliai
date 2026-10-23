import { describe, expect, it } from "vitest";
import { planBasketNewsTransfers } from "./transfers";
import type { BasketNewsTransfer } from "./client";

function event(id: string, a: string, out: string[], into: string[], b: string | null = null): BasketNewsTransfer {
  return { id, type: b ? "trade" : "free_agent", status: "accepted", createdAt: `2026-10-20T10:00:0${id}Z`, updatedAt: "2026-10-21T13:03:25Z",
    offer: { fantasyTeamId: a, players: out.map((playerId) => ({ playerId })) }, request: { fantasyTeamId: b, players: into.map((playerId) => ({ playerId })) } };
}
const input = {
  round: 7, source: "BasketNews", teamName: (id: string) => id, playerName: (id: string) => id,
  seats: [{ id: "ax", member: "a", player: "x" }, { id: "by", member: "b", player: "y" }],
  target: new Map([["a", ["y"]], ["b", ["z"]]]),
  memberOf: new Map([["a", "a"], ["b", "b"]]), playerOf: new Map(["x", "y", "z", "w"].map((id) => [id, id])),
};

describe("BasketNews transfer history", () => {
  it("keeps a traded then released player in both events without a pass-through roster window", () => {
    const steps = planBasketNewsTransfers({ ...input, events: [event("2", "b", ["x"], ["z"]), event("1", "a", ["x"], ["y"], "b")] })!;
    expect(steps).toHaveLength(3);
    expect(steps[0]?.plan).toMatchObject({ type: "trade", playersIn: { b: ["x"] }, opens: [{ member: "a", player: "y" }] });
    expect(steps[1]?.plan.playersOut).toEqual({ b: ["x"] });
    expect(steps.flatMap((step) => step.plan.opens).some((open) => open.member === "b" && open.player === "x")).toBe(false);
    expect(steps[2]?.plan.opens).toEqual([{ member: "b", player: "z", fromRound: 7, acquired_via: "signing" }]);
    expect(steps.map((step) => step.provenance)).toEqual([
      { provider: "basketnews", eventId: "1", leg: "trade" }, { provider: "basketnews", eventId: "2", leg: "drop" }, { provider: "basketnews", eventId: "2", leg: "add" },
    ]);
  });

  it("preserves unequal multi-player sides", () => {
    const steps = planBasketNewsTransfers({ ...input, seats: [...input.seats, { id: "aw", member: "a", player: "w" }], target: new Map([["a", ["y"]], ["b", ["x", "w"]]]), events: [event("1", "a", ["x", "w"], ["y"], "b")] })!;
    expect(steps[0]?.plan.playersOut).toEqual({ a: ["x", "w"], b: ["y"] });
    expect(steps[0]?.plan.opens).toHaveLength(3);
  });

  it("refuses accepted offers that conflict or fail to reach the official roster", () => {
    expect(planBasketNewsTransfers({ ...input, events: [event("1", "a", ["x"], ["y"])] })).toBeNull();
    expect(planBasketNewsTransfers({ ...input, events: [event("1", "a", ["x"], ["y"], "b")] })).toBeNull();
  });

  it("ignores pending and already recorded events", () => {
    const steps = planBasketNewsTransfers({ ...input, target: new Map([["a", ["x"]], ["b", ["y"]]]), appliedIds: new Set(["2"]), events: [{ ...event("1", "a", ["x"], ["z"]), status: "pending" }, event("2", "a", ["x"], ["w"])] });
    expect(steps).toEqual([]);
  });
});
