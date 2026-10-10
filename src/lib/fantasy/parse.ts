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

function positionFrom(name: string): Position {
  const position = POSITIONS[name.trim()];
  if (!position) throw new Error(`The Fantasy Challenge lists a position we do not know: ${name}.`);
  return position;
}

export const id = z.union([z.number().int(), z.string().min(1)]).transform(String);
const text = z.string().nullish().transform((value) => value?.trim() ?? "");

/** One official player as both the rosters and a lineup carry him. */
export const playerSchema = z.object({
  id,
  first_name: text,
  last_name: z.string().min(1).transform((value) => value.trim()),
  jersey: z.union([z.string(), z.number()]).nullish().transform((value) => (value == null ? "" : String(value).trim())),
  position: z.object({ name: z.string() }),
  team: z.object({ id, name: z.string() }),
});

export function fantasyPlayerFrom(player: z.infer<typeof playerSchema>): FantasyPlayer {
  return {
    id: player.id,
    firstName: player.first_name,
    lastName: player.last_name,
    jersey: player.jersey,
    position: positionFrom(player.position.name),
    club: { id: player.team.id, name: player.team.name.trim() },
  };
}

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
    players: team.players.map(fantasyPlayerFrom),
  }));
}

/**
 * One move from the official game's log, `player_1` arriving and `player_2`
 * leaving. Each player's `fantasy_team` is where he went, so a trade names both
 * teams and a free-agent swap leaves the departure's team empty. The log has no
 * times; ids rise in the order the moves were made.
 */
export type FantasyMove = {
  readonly id: number;
  readonly arrival: { readonly playerId: string; readonly teamId: string };
  readonly departure: { readonly playerId: string; readonly teamId: string | null };
};

const movesSchema = z.object({
  data: z.array(
    z.object({
      id: z.number().int(),
      player_1: z.object({ id, fantasy_team: z.object({ id }) }),
      player_2: z.object({ id, fantasy_team: z.object({ id }).nullish() }),
    }),
  ),
});

export function parseLeagueMoves(raw: unknown): FantasyMove[] {
  const parsed = movesSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") || "(root)";
    throw new Error(`The Fantasy Challenge move log changed shape at ${where}.`);
  }
  return parsed.data.data.map((move) => ({
    id: move.id,
    arrival: { playerId: move.player_1.id, teamId: move.player_1.fantasy_team.id },
    departure: { playerId: move.player_2.id, teamId: move.player_2.fantasy_team?.id ?? null },
  }));
}

/** The list holds every club's coach as a player row; positions read only players. */
const COACH = "Head Coach";

const poolPageSchema = z.object({
  data: z.array(playerSchema),
  meta: z.object({ last_page: z.number().int() }),
});

/** One page of the whole pool the game lists for a matchday (7.2 A research). */
export function parsePlayerPoolPage(raw: unknown): { players: FantasyPlayer[]; lastPage: number } {
  const parsed = poolPageSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") || "(root)";
    throw new Error(`The Fantasy Challenge player pool changed shape at ${where}; no position was read.`);
  }
  return {
    players: parsed.data.data.filter((player) => player.position.name.trim() !== COACH).map(fantasyPlayerFrom),
    lastPage: parsed.data.meta.last_page,
  };
}

const configSchema = z.object({
  data: z.object({
    current_players_list_id: z.number().int(),
    current_matchday: z.object({ id: z.number().int() }),
  }),
});

/** Which list and matchday hold the pool today. A future matchday omits clubs not yet scheduled. */
export function parseGameConfig(raw: unknown): { playersListId: number; matchdayId: number } {
  const parsed = configSchema.safeParse(raw);
  if (!parsed.success) throw new Error("The Fantasy Challenge config changed shape; no position was read.");
  return { playersListId: parsed.data.data.current_players_list_id, matchdayId: parsed.data.data.current_matchday.id };
}
