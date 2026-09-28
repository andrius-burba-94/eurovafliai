import { describe, expect, it } from "vitest";

import { DEFAULT_LINEUP_TEMPLATE, isOfficialFormation, slotsFromRoles, validateLineup } from "./lineup";
import { optimizeLineup, type OptimizationPlayer } from "./optimize";

const squad: OptimizationPlayer[] = [
  ...["g1", "g2", "g3", "g4", "g5"].map((id) => ({ id, position: "G" as const, estimateTenths: 100, currentRole: null })),
  ...["f1", "f2", "f3", "f4", "f5"].map((id) => ({ id, position: "F" as const, estimateTenths: 100, currentRole: null })),
  ...["c1", "c2", "c3"].map((id) => ({ id, position: "C" as const, estimateTenths: 100, currentRole: null })),
];

describe("optimizeLineup", () => {
  it("maximizes the weighted estimate within an official formation", () => {
    const players = squad.map((player) => ({ ...player, estimateTenths: player.id === "c1" ? 400 : player.id === "c2" ? 350 : player.id === "f1" ? 300 : player.id === "g1" ? 250 : 100 }));
    const result = optimizeLineup(players, DEFAULT_LINEUP_TEMPLATE);
    expect(result).not.toBeNull();
    expect(result!.roles.c1).toBe("captain");
    expect(["starter", "sixth"]).toContain(result!.roles.c2);
    const starters = Object.entries(result!.roles).filter(([, role]) => role === "starter" || role === "captain").map(([id]) => id);
    const counts = ["G", "F", "C"].map((position) => starters.filter((id) => players.find((player) => player.id === id)?.position === position).length) as [number, number, number];
    expect(isOfficialFormation(counts)).toBe(true);
    expect(validateLineup({
      slots: slotsFromRoles(Object.entries(result!.roles).map(([playerId, role]) => ({ playerId, role }))),
      squad: players.map((player) => ({ playerId: player.id, position: player.position })),
      template: DEFAULT_LINEUP_TEMPLATE,
    }).ok).toBe(true);
  });

  it("keeps the current placements before player ID when estimates tie", () => {
    const current: Record<string, OptimizationPlayer["currentRole"]> = {
      g1: "captain", g2: "starter", f1: "starter", f2: "starter", c1: "starter",
      g3: "sixth", g4: "bench", f3: "bench", f4: "bench", c2: "bench",
      g5: "inactive", f5: "inactive", c3: "inactive",
    };
    const result = optimizeLineup(squad.map((player) => ({ ...player, currentRole: current[player.id] ?? null })), DEFAULT_LINEUP_TEMPLATE);
    expect(result?.formation).toBe("2-2-1");
    expect(result?.roles).toEqual(current);
  });

  it("identifies players with no estimate without inventing form", () => {
    const result = optimizeLineup(squad.map((player) => player.id === "c3" ? { ...player, estimateTenths: null } : player), DEFAULT_LINEUP_TEMPLATE);
    expect(result?.unknownIds).toEqual(["c3"]);
  });
});
