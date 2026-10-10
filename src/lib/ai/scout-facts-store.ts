import type PocketBase from "pocketbase";

import type { Ruleset } from "@/lib/advisor/outlook";
import { readLeagueMoves } from "@/lib/advisor/read";
import type { ScoutMove } from "@/lib/advisor/scout";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import { displayName, surname } from "@/lib/players/name";
import { leagueSource } from "@/lib/positions";

/**
 * What the reasons' sheet is built from, read with the worker's client — 7.2 G.
 * Framework-free. Every member's moves, worked out exactly as their page works
 * them out, and the names the prose must never spell.
 */

export type ScoutFactsInput = {
  readonly ruleset: Ruleset;
  readonly members: readonly { readonly memberId: string; readonly moves: readonly ScoutMove[] }[];
  readonly privateNames: readonly string[];
};

type LeagueRow = {
  id: string;
  name: string;
  settings?: unknown;
  basketnews_team_id?: string;
  fantasy_league_id?: string;
};

export async function readScoutFactsInput(
  pb: PocketBase,
  { leagueId, season }: { leagueId: string; season: string },
): Promise<ScoutFactsInput | null> {
  const league = await pb.collection("leagues").getOne<LeagueRow>(leagueId, { requestKey: null }).catch(() => null);
  if (!league) return null;
  const [{ ruleset, members }, people] = await Promise.all([
    readLeagueMoves(pb, {
      leagueId,
      source: leagueSource(league),
      season,
      template: parseLeagueSettings(league.settings).roster_template,
    }),
    pb.collection("league_members").getFullList<{ team_name?: string; expand?: { user?: { name?: string } } }>({
      filter: `league = '${leagueId}'`,
      fields: "team_name,expand.user.name",
      expand: "user",
      requestKey: null,
    }),
  ]);
  const players = members.flatMap((member) => member.moves.flatMap((move) => [move.drop.name, move.add.name]));
  const privateNames = [
    league.name,
    ...people.flatMap((person) => [person.team_name ?? "", person.expand?.user?.name ?? ""]),
    ...players.flatMap((name) => [displayName(name), surname(name)]),
  ].filter((name) => name.trim() !== "");
  return { ruleset, members, privateNames: [...new Set(privateNames)] };
}
