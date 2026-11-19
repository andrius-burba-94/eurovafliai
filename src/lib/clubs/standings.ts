import { z } from "zod";

import { getFeedJson, type FeedFetch } from "@/lib/euroleague/http";

/** One club's line in the official Euroleague table. */
export type ClubStanding = {
  readonly code: string;
  readonly position: number;
  readonly played: number;
  readonly won: number;
  readonly lost: number;
};

/**
 * The official table after a round: `basicstandings` on the feed's v3 API
 * (the v2 path answers 405). Checked 2026-11-19 against round 13: twenty
 * clubs, position as the official site prints it, so head-to-head tiebreaks
 * are theirs rather than ours to reimplement.
 */
export function standingsUrl(season: string, round: number): string {
  return `https://api-live.euroleague.net/v3/competitions/E/seasons/${season}/rounds/${round}/basicstandings`;
}

// Only the fields read: a change to anything else in the payload must not stop the table.
const Team = z.object({
  position: z.number().int().positive(),
  gamesPlayed: z.number().int().nonnegative(),
  gamesWon: z.number().int().nonnegative(),
  gamesLost: z.number().int().nonnegative(),
  club: z.object({ code: z.string().min(1) }),
});
const Standings = z.object({ teams: z.array(z.unknown()).nullable().optional() });

/** The table, or null when the round has none yet (a future round answers with no teams). */
export function parseClubStandings(raw: unknown): ClubStanding[] | null {
  const parsed = Standings.safeParse(raw);
  if (!parsed.success) return null;
  const clubs = (parsed.data.teams ?? []).flatMap((team) => {
    const row = Team.safeParse(team);
    return row.success
      ? [{ code: row.data.club.code, position: row.data.position, played: row.data.gamesPlayed, won: row.data.gamesWon, lost: row.data.gamesLost }]
      : [];
  });
  return clubs.length > 0 ? clubs.sort((a, b) => a.position - b.position) : null;
}

export async function fetchClubStandings(season: string, round: number, doFetch: FeedFetch = fetch): Promise<ClubStanding[] | null> {
  return parseClubStandings(await getFeedJson(standingsUrl(season, round), doFetch));
}

/**
 * The round whose table is current: the latest one with a game already
 * tipped off. Its table counts every game of it that has finished, and a
 * round not yet started has no table at all.
 */
export function standingsRound(fixtures: readonly { round: number; utc_date?: string | null }[], now: number): number | null {
  let latest: number | null = null;
  for (const fixture of fixtures) {
    const at = fixture.utc_date ? Date.parse(fixture.utc_date) : Number.NaN;
    if (Number.isFinite(at) && at <= now && (latest === null || fixture.round > latest)) latest = fixture.round;
  }
  return latest;
}
