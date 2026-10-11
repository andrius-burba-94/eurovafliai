import type PocketBase from "pocketbase";

import { readLeagueMoves } from "@/lib/advisor/read";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import { leagueSource } from "@/lib/positions";

import type { BriefFactsInput } from "./brief-facts";
import { readRoundFactsInput } from "./round-facts-store";

/**
 * The reads behind the briefs' sheet — slice 7.3 A. Framework-free.
 *
 * Exactly what the round sheet reads, so a round it refuses is refused here
 * too, plus every member's moves worth making as their Scout page works them
 * out today: the third line is a forecast as of writing (ADR-0013).
 */

export type BriefFactsRead =
  | {
      readonly ok: true;
      readonly input: BriefFactsInput;
      readonly teamNames: Readonly<Record<string, string>>;
      readonly playerNames: Readonly<Record<string, string>>;
    }
  | { readonly ok: false; readonly reason: string };

export async function readBriefFactsInput(
  pb: PocketBase,
  options: { leagueId: string; season: string; round?: number; now: number },
): Promise<BriefFactsRead> {
  const read = await readRoundFactsInput(pb, options);
  if (!read.ok) return read;
  const league = await pb
    .collection("leagues")
    .getOne<{ settings?: unknown; basketnews_team_id?: string; fantasy_league_id?: string }>(options.leagueId, { requestKey: null });
  const { members } = await readLeagueMoves(pb, {
    leagueId: options.leagueId,
    source: leagueSource(league),
    season: options.season,
    template: parseLeagueSettings(league.settings).roster_template,
  });
  return { ...read, input: { ...read.input, moves: members } };
}
