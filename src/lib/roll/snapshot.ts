import { connection } from "next/server";

import { rollCeremony, type RollCeremony } from "./ceremony";

/**
 * The ceremony as the server sees it, right now.
 *
 * This exists so the roll page's **first paint is already correct**. The phase
 * is a function of a stored instant and the current time, and the current time
 * is not something a render may invent: reading it inside a component is both
 * impure (React's own rule, and this repo's lint enforces it) and wrong at the
 * boundary, because a prerendered timestamp would freeze the ceremony at build
 * time for everyone.
 *
 * `connection()` is the documented way to say "what follows is per-request",
 * the same declaration `/api/time` makes and for the same reason: this value is
 * only ever correct at request time.
 *
 * Without this the page would have to start every visitor at ten and let a
 * client effect correct it a frame later — which is precisely wrong for the
 * visitor this design is for, the one who opens the page thirty seconds late
 * and should join the draw in progress rather than watch it restart.
 */
export async function serverRollCeremony({
  rolledAt,
  slots,
}: {
  rolledAt: number | null;
  slots: number;
}): Promise<RollCeremony> {
  await connection();
  return rollCeremony({ rolledAt, now: Date.now(), slots });
}
