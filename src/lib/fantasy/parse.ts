import { z } from "zod";

import type { Position } from "@/lib/engine";

/**
 * The official game's league rosters, reduced to what the sync reads.
 *
 * Pure. The schema names only the fields we use, so a new field on their side
 * changes nothing here; a missing one throws before any write, which is the
 * safe direction for an unattended job.
 */

export type FantasyPlayer = {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly jersey: string;
  readonly position: Position;
  readonly club: { readonly id: string; readonly name: string };
};

export type FantasyTeam = {
  readonly id: string;
  readonly name: string;
  readonly manager: string;
  readonly players: readonly FantasyPlayer[];
};

const POSITIONS: Record<string, Position> = { Guard: "G", Forward: "F", Center: "C" };

const id = z.union([z.number().int(), z.string().min(1)]).transform(String);
const text = z.string().nullish().transform((value) => value?.trim() ?? "");

const playerSchema = z.object({
  id,
  first_name: text,
  last_name: z.string().min(1).transform((value) => value.trim()),
  jersey: z.union([z.string(), z.number()]).nullish().transform((value) => (value == null ? "" : String(value).trim())),
  position: z.object({ name: z.string() }),
  team: z.object({ id, name: z.string() }),
});

const rostersSchema = z.object({
  data: z.array(
    z.object({
      id,
      name: z.string(),
      user: z.object({ first_name: text, last_name: text }).nullish(),
      players: z.array(playerSchema),
    }),
  ),
});

export function parseLeagueRosters(raw: unknown): FantasyTeam[] {
  const parsed = rostersSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") || "(root)";
    throw new Error(`The Fantasy Challenge rosters changed shape at ${where}; nothing was synced.`);
  }
  return parsed.data.data.map((team) => ({
    id: team.id,
    name: team.name.trim(),
    manager: [team.user?.first_name, team.user?.last_name].filter(Boolean).join(" "),
    players: team.players.map((player) => {
      const position = POSITIONS[player.position.name.trim()];
      if (!position) {
        throw new Error(`The Fantasy Challenge lists a position we do not know: ${player.position.name}.`);
      }
      return {
        id: player.id,
        firstName: player.first_name,
        lastName: player.last_name,
        jersey: player.jersey,
        position,
        club: { id: player.team.id, name: player.team.name.trim() },
      };
    }),
  }));
}
