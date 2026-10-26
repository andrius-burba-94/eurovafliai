import { z } from "zod";

import {
  type LineupSlots,
  type LineupSquadPlayer,
  type LineupTemplate,
  type LineupVerdict,
  validateLineup,
} from "@/lib/lineups/lineup";

import { fantasyPlayerFrom, id, playerSchema, type FantasyPlayer } from "./parse";

/**
 * The official game's round lineups, read into ours.
 *
 * Pure. The official lineup is a list of court positions: 1–5 the starting
 * five, 6 the sixth man, 7–10 the bench. The three inactive players are not in
 * it at all, so they are whoever on our round's roster it does not name. The
 * league's lineup template says where each group ends, which for Draft Mode is
 * the official 5 / 1 / 4 / 3.
 *
 * Nothing here repairs a lineup. A player we cannot place, a second captain or
 * an illegal five is refused with a reason, and the round keeps whatever it
 * was scored at before: a guess would print a total neither game agrees with.
 */

export type OfficialLineupPlayer = {
  readonly id: string;
  readonly name: string;
  readonly courtPosition: number;
  readonly captain: boolean;
  /** Everything the roster matcher needs, for a player no roster sync has linked. */
  readonly official: FantasyPlayer;
};

export type OfficialLineup = {
  /** The team's round total as the official game counts it. */
  readonly pts: number;
  readonly players: readonly OfficialLineupPlayer[];
};

const lineupSchema = z.object({
  data: z.object({
    pts: z.number().nullish().transform((value) => value ?? 0),
    players: z.array(
      playerSchema.extend({
        court_position: z.number().int().min(1),
        is_captain: z.boolean().nullish().transform(Boolean),
      }),
    ),
  }),
});

export function parseRoundLineup(raw: unknown): OfficialLineup {
  const parsed = lineupSchema.safeParse(raw);
  if (!parsed.success) {
    const where = parsed.error.issues[0]?.path.join(".") || "(root)";
    throw new Error(`The Fantasy Challenge lineup changed shape at ${where}; nothing was synced.`);
  }
  return {
    pts: parsed.data.data.pts,
    players: parsed.data.data.players
      .map((player) => ({
        id: player.id,
        name: [player.first_name, player.last_name].filter(Boolean).join(" "),
        courtPosition: player.court_position,
        captain: player.is_captain,
        official: fantasyPlayerFrom(player),
      }))
      .sort((a, b) => a.courtPosition - b.courtPosition),
  };
}

const teamsSchema = z.object({
  data: z.array(
    z.object({
      matchday: z.object({ id: z.number().int(), number: z.number().int() }),
      fantasy_league: z.object({ id }).nullish(),
    }),
  ),
});

export function parseCurrentMatchday(raw: unknown, fantasyLeagueId: string): { id: number; number: number } {
  const parsed = teamsSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error("The Fantasy Challenge team list changed shape; nothing was synced.");
  }
  const team = parsed.data.data.find((row) => row.fantasy_league?.id === fantasyLeagueId);
  if (!team) {
    throw new Error(`The token's owner has no team in official league ${fantasyLeagueId}.`);
  }
  return team.matchday;
}

/** Matchdays are numbered one per round, so a round's id is counted from the current one. */
export function matchdayIdForRound(current: { id: number; number: number }, round: number): number {
  return current.id - (current.number - round);
}

export function slotsFromOfficial(input: {
  readonly lineup: OfficialLineup;
  /** Official player id → pool player id, from `players.fantasy_id`. */
  readonly playerIdFor: ReadonlyMap<string, string>;
  readonly squad: readonly LineupSquadPlayer[];
  readonly template: LineupTemplate;
}): LineupVerdict {
  const { lineup, playerIdFor, squad, template } = input;
  const unlinked = lineup.players.filter((player) => !playerIdFor.has(player.id));
  if (unlinked.length > 0) {
    return {
      ok: false,
      reason: `${unlinked.map((player) => player.name).join(", ")} ${unlinked.length === 1 ? "is" : "are"} not linked to a pool player yet.`,
    };
  }
  const captains = lineup.players.filter((player) => player.captain);
  if (captains.length !== 1) {
    return { ok: false, reason: `The official lineup names ${captains.length} captains.` };
  }

  const sixthFrom = template.starters + 1;
  const benchFrom = sixthFrom + template.sixth;
  const inactiveFrom = benchFrom + template.bench;
  const placed = (from: number, to: number) =>
    lineup.players
      .filter((player) => player.courtPosition >= from && player.courtPosition < to)
      .map((player) => playerIdFor.get(player.id)!);

  const named = new Set(lineup.players.map((player) => playerIdFor.get(player.id)!));
  const slots: LineupSlots = {
    starters: placed(1, sixthFrom),
    captain: playerIdFor.get(captains[0]!.id)!,
    sixth: placed(sixthFrom, benchFrom),
    bench: placed(benchFrom, inactiveFrom),
    inactive: [
      ...placed(inactiveFrom, Number.POSITIVE_INFINITY),
      ...squad.map((player) => player.playerId).filter((playerId) => !named.has(playerId)),
    ],
  };
  return validateLineup({ slots, template, squad });
}
