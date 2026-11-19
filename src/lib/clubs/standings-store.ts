import type PocketBase from "pocketbase";

import type { ClubStanding } from "./standings";

type StoredStandings = { id: string; season: string; round: number; clubs: ClubStanding[]; checked_at: string };

/**
 * Keep the season's one table current. One row per season (a unique index):
 * a retried or doubled pass updates it rather than adding a second, and a
 * failed write leaves the previous table, which is still right until the next
 * game finishes. Unchanged tables are not rewritten, so the row's realtime
 * stream stays quiet between results.
 */
export async function upsertClubStandings(pb: Pick<PocketBase, "collection">, input: {
  season: string;
  round: number;
  clubs: readonly ClubStanding[];
  checkedAt: string;
}): Promise<"created" | "updated" | "unchanged"> {
  const collection = pb.collection("club_standings");
  const filter = `season = '${input.season}'`;
  const body = { season: input.season, round: input.round, clubs: input.clubs, checked_at: input.checkedAt };
  const current = (await collection.getFullList<StoredStandings>({ filter, requestKey: null }))[0];
  if (current) {
    if (current.round === input.round && JSON.stringify(current.clubs) === JSON.stringify(input.clubs)) return "unchanged";
    await collection.update(current.id, body, { requestKey: null });
    return "updated";
  }
  try {
    await collection.create(body, { requestKey: null });
    return "created";
  } catch (error) {
    const fields = (error as { response?: { data?: Record<string, { code?: string }> } })?.response?.data;
    if (!Object.values(fields ?? {}).some((field) => field.code === "validation_not_unique")) throw error;
    const raced = (await collection.getFullList<StoredStandings>({ filter, requestKey: null }))[0];
    if (!raced) throw error;
    await collection.update(raced.id, body, { requestKey: null });
    return "updated";
  }
}

/** Club code → its line, or an empty map when no table has been stored. */
export async function readClubStandings(pb: Pick<PocketBase, "collection">, season: string): Promise<ReadonlyMap<string, ClubStanding>> {
  const rows = await pb.collection("club_standings").getFullList<StoredStandings>({ filter: `season = '${season}'`, requestKey: null });
  return new Map((rows[0]?.clubs ?? []).map((club) => [club.code, club]));
}
