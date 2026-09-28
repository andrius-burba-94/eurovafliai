import { describe, expect, it } from "vitest";

import { DEFAULT_LINEUP_TEMPLATE, FORMATIONS } from "./lineup";
import { arrangeFormation, type FormationPlayer } from "./formation";

const players: FormationPlayer[] = [
  ...["g1", "g2", "g3", "g4", "g5"].map((id) => ({ id, position: "G" as const, place: "" as const })),
  ...["f1", "f2", "f3", "f4", "f5"].map((id) => ({ id, position: "F" as const, place: "" as const })),
  ...["c1", "c2", "c3"].map((id) => ({ id, position: "C" as const, place: "" as const })),
];

describe("formation selection", () => {
  it.each(FORMATIONS)("fills %s-%s-%s from an empty roster", (...shape) => {
    const result = arrangeFormation(players, shape, DEFAULT_LINEUP_TEMPLATE, "");
    expect(result).not.toBeNull();
    const starters = players.filter((player) => result!.places[player.id] === "starter");
    expect(["G", "F", "C"].map((position) => starters.filter((player) => player.position === position).length)).toEqual(shape);
    expect(Object.values(result!.places).filter((role) => role === "sixth")).toHaveLength(1);
    expect(Object.values(result!.places).filter((role) => role === "bench")).toHaveLength(4);
    expect(Object.values(result!.places).filter((role) => role === "inactive")).toHaveLength(3);
    expect(result!.places[result!.captainId]).toBe("starter");
  });

  it("retains the current starters and captain when the shape permits", () => {
    const arranged = players.map((player) => ({ ...player, place: ["g4", "g5", "f4", "f5", "c3"].includes(player.id) ? "starter" as const : "bench" as const }));
    const result = arrangeFormation(arranged, [2, 2, 1], DEFAULT_LINEUP_TEMPLATE, "g5");
    expect(result?.captainId).toBe("g5");
    for (const id of ["g4", "g5", "f4", "f5", "c3"]) expect(result?.places[id]).toBe("starter");
  });
});
