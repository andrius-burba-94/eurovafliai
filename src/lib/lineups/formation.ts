import type { Position } from "@/lib/engine";

import type { LineupTemplate, PlacementRole } from "./lineup";

export type FormationPlayer = {
  readonly id: string;
  readonly position: Position;
  readonly place: PlacementRole | "";
};

export type FormationArrangement = {
  readonly places: Readonly<Record<string, PlacementRole | "">>;
  readonly captainId: string;
};

const POSITION_ORDER: readonly Position[] = ["G", "F", "C"];
const START_PRIORITY: Readonly<Record<PlacementRole | "", number>> = {
  starter: 0, sixth: 1, bench: 2, inactive: 3, "": 4,
};

/** Fill the requested legal five while keeping as many existing places as possible. */
export function arrangeFormation(
  players: readonly FormationPlayer[],
  shape: readonly [number, number, number],
  template: LineupTemplate,
  captainId: string,
): FormationArrangement | null {
  const starters: string[] = [];
  for (const [index, position] of POSITION_ORDER.entries()) {
    const candidates = players.filter((player) => player.position === position)
      .sort((a, b) => START_PRIORITY[a.place] - START_PRIORITY[b.place]
        || Number(b.id === captainId) - Number(a.id === captainId)
        || a.id.localeCompare(b.id));
    if (candidates.length < shape[index]!) return null;
    starters.push(...candidates.slice(0, shape[index]).map((player) => player.id));
  }
  const startIds = new Set(starters);
  const places: Record<string, PlacementRole | ""> = Object.fromEntries(players.map((player) => [player.id, ""]));
  for (const id of starters) places[id] = "starter";

  const remaining = players.filter((player) => !startIds.has(player.id));
  for (const [role, capacity] of [
    ["sixth", template.sixth], ["bench", template.bench], ["inactive", template.inactive],
  ] as const) {
    const candidates = remaining.filter((player) => places[player.id] === "")
      .sort((a, b) => Number(b.place === role) - Number(a.place === role)
        || START_PRIORITY[a.place] - START_PRIORITY[b.place]
        || a.id.localeCompare(b.id));
    for (const player of candidates.slice(0, capacity)) places[player.id] = role;
  }
  return { places, captainId: startIds.has(captainId) ? captainId : starters[0]! };
}
