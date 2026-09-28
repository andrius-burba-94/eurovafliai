import type { Position } from "@/lib/engine";

import { FORMATIONS, type LineupRole, type LineupTemplate } from "./lineup";

export type OptimizationPlayer = {
  readonly id: string;
  readonly position: Position;
  readonly estimateTenths: number | null;
  readonly currentRole: LineupRole | null;
};

export type Optimization = {
  readonly roles: Readonly<Record<string, LineupRole>>;
  readonly formation: string;
  /** The full role-weighted estimate, in half-tenths to avoid rounding ties. */
  readonly scoreHalfTenths: number;
  readonly unknownIds: readonly string[];
};

function combinations<T>(items: readonly T[], count: number): T[][] {
  if (count === 0) return [[]];
  if (items.length < count) return [];
  const out: T[][] = [];
  for (let index = 0; index <= items.length - count; index += 1) {
    for (const tail of combinations(items.slice(index + 1), count - 1)) {
      out.push([items[index]!, ...tail]);
    }
  }
  return out;
}

function value(player: OptimizationPlayer): number {
  return player.estimateTenths ?? 0;
}

function signature(roles: Readonly<Record<string, LineupRole>>): string {
  return Object.entries(roles).sort(([a], [b]) => a.localeCompare(b)).map(([id, role]) => `${id}:${role}`).join("|");
}

/** Preview only. The server still validates and records the proposed lineup. */
export function optimizeLineup(players: readonly OptimizationPlayer[], template: LineupTemplate): Optimization | null {
  if (template.starters !== 5) return null;
  const sorted = [...players].sort((a, b) => a.id.localeCompare(b.id));
  let best: { result: Optimization; retained: number; signature: string } | null = null;
  for (const shape of FORMATIONS) {
    const [guards, forwards, centers] = shape.map((needed, index) =>
      combinations(sorted.filter((player) => player.position === (["G", "F", "C"] as const)[index]), needed),
    );
    for (const g of guards!) for (const f of forwards!) for (const c of centers!) {
      const starters = [...g, ...f, ...c];
      const startingIds = new Set(starters.map((player) => player.id));
      const remaining = sorted.filter((player) => !startingIds.has(player.id));
      const captain = [...starters].sort((a, b) => value(b) - value(a) || Number(b.currentRole === "captain") - Number(a.currentRole === "captain") || a.id.localeCompare(b.id))[0]!;
      const sixth = [...remaining].sort((a, b) => value(b) - value(a) || Number(b.currentRole === "sixth") - Number(a.currentRole === "sixth") || a.id.localeCompare(b.id))[0];
      const afterSixth = remaining.filter((player) => player.id !== sixth?.id);
      const bench = [...afterSixth].sort((a, b) => value(b) - value(a) || Number(b.currentRole === "bench") - Number(a.currentRole === "bench") || a.id.localeCompare(b.id)).slice(0, template.bench);
      const benchIds = new Set(bench.map((player) => player.id));
      const roles: Record<string, LineupRole> = {};
      for (const player of starters) roles[player.id] = player.id === captain.id ? "captain" : "starter";
      if (sixth) roles[sixth.id] = "sixth";
      for (const player of bench) roles[player.id] = "bench";
      for (const player of afterSixth) if (!benchIds.has(player.id)) roles[player.id] = "inactive";
      const scoreHalfTenths = starters.reduce((sum, player) => sum + value(player) * 2, 0)
        + value(captain) * 2 + (sixth ? value(sixth) * 2 : 0)
        + bench.reduce((sum, player) => sum + value(player), 0);
      const retained = sorted.filter((player) => roles[player.id] === player.currentRole).length;
      const result: Optimization = {
        roles,
        formation: shape.join("-"),
        scoreHalfTenths,
        unknownIds: sorted.filter((player) => player.estimateTenths === null).map((player) => player.id),
      };
      const key = signature(roles);
      if (!best || scoreHalfTenths > best.result.scoreHalfTenths
        || (scoreHalfTenths === best.result.scoreHalfTenths && retained > best.retained)
        || (scoreHalfTenths === best.result.scoreHalfTenths && retained === best.retained && key < best.signature)) {
        best = { result, retained, signature: key };
      }
    }
  }
  return best?.result ?? null;
}
