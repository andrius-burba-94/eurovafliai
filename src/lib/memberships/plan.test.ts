import { describe, expect, it } from "vitest";

import { planTransaction, type Seat } from "./plan";

const TEMPLATE = { G: 2, F: 1, C: 0 };

const seats: Seat[] = [
  { id: "s1", member: "m-a", player: "p-g1", position: "G" },
  { id: "s2", member: "m-a", player: "p-g2", position: "G" },
  { id: "s3", member: "m-a", player: "p-f1", position: "F" },
  { id: "s4", member: "m-b", player: "p-g3", position: "G" },
  { id: "s5", member: "m-b", player: "p-g4", position: "G" },
  { id: "s6", member: "m-b", player: "p-f2", position: "F" },
];

const owned = new Set(seats.map((seat) => seat.player));

describe("planTransaction — trade", () => {
  it("swaps one guard each way", () => {
    const verdict = planTransaction(seats, TEMPLATE, owned, {
      type: "trade",
      fromRound: 2,
      memberA: "m-a",
      memberB: "m-b",
      outA: ["p-g1"],
      outB: ["p-g3"],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.plan.closes).toHaveLength(2);
    expect(verdict.plan.opens).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          member: "m-b",
          player: "p-g1",
          acquired_via: "trade",
          fromRound: 2,
        }),
        expect.objectContaining({
          member: "m-a",
          player: "p-g3",
          acquired_via: "trade",
        }),
      ]),
    );
  });

  it("refuses a 2-for-1", () => {
    const verdict = planTransaction(seats, TEMPLATE, owned, {
      type: "trade",
      fromRound: 2,
      memberA: "m-a",
      memberB: "m-b",
      outA: ["p-g1", "p-g2"],
      outB: ["p-g3"],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/same number/i);
  });

  it("refuses swapping a guard for a forward when the other side is full of forwards", () => {
    const verdict = planTransaction(seats, TEMPLATE, owned, {
      type: "trade",
      fromRound: 2,
      memberA: "m-a",
      memberB: "m-b",
      outA: ["p-g1"],
      outB: ["p-f2"],
    });
    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.reason).toMatch(/position cap|template/i);
  });

  it("refuses a player the member does not hold", () => {
    const verdict = planTransaction(seats, TEMPLATE, owned, {
      type: "trade",
      fromRound: 2,
      memberA: "m-a",
      memberB: "m-b",
      outA: ["p-g3"],
      outB: ["p-g1"],
    });
    expect(verdict.ok).toBe(false);
  });
});

describe("planTransaction — drop and add", () => {
  it("drops a player and leaves a vacancy", () => {
    const verdict = planTransaction(seats, TEMPLATE, owned, {
      type: "drop",
      fromRound: 3,
      member: "m-a",
      playerIds: ["p-g2"],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.plan.opens).toHaveLength(0);
    expect(verdict.plan.closes[0]).toMatchObject({
      membershipId: "s2",
      toRound: 3,
    });
  });

  it("signs a free agent into a vacancy", () => {
    const afterDrop: Seat[] = seats.filter((seat) => seat.player !== "p-g2");
    const stillOwned = new Set(afterDrop.map((seat) => seat.player));
    const verdict = planTransaction(afterDrop, TEMPLATE, stillOwned, {
      type: "add",
      fromRound: 3,
      member: "m-a",
      players: [{ id: "p-free", position: "G" }],
    });
    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.plan.opens[0]).toMatchObject({
      member: "m-a",
      player: "p-free",
      acquired_via: "signing",
    });
  });

  it("refuses signing a player who is already rostered", () => {
    const verdict = planTransaction(seats, TEMPLATE, owned, {
      type: "add",
      fromRound: 3,
      member: "m-a",
      players: [{ id: "p-g3", position: "G" }],
    });
    expect(verdict.ok).toBe(false);
  });

  it("refuses a sixth of a full bucket", () => {
    const verdict = planTransaction(seats, TEMPLATE, owned, {
      type: "add",
      fromRound: 3,
      member: "m-a",
      players: [{ id: "p-free", position: "G" }],
    });
    expect(verdict.ok).toBe(false);
  });

  it("refuses a from_round of 0", () => {
    const verdict = planTransaction(seats, TEMPLATE, owned, {
      type: "drop",
      fromRound: 0,
      member: "m-a",
      playerIds: ["p-g1"],
    });
    expect(verdict.ok).toBe(false);
  });
});
