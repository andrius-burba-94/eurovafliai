import type PocketBase from "pocketbase";

import type { LiveGame, LivePlayer } from "./boxscore";

export type LiveSnapshot = LiveGame & {
  readonly id: string;
  readonly season: string;
  readonly game_code: number;
  readonly round: number;
  readonly checked_at: string;
};

type StoredSnapshot = Omit<LiveSnapshot, "localScore" | "roadScore"> & {
  readonly local_score: number;
  readonly road_score: number;
  readonly players: LivePlayer[];
};

export function asLiveSnapshot(row: StoredSnapshot): LiveSnapshot {
  return {
    id: row.id,
    season: row.season,
    game_code: row.game_code,
    round: row.round,
    checked_at: row.checked_at,
    live: row.live,
    localScore: row.local_score,
    roadScore: row.road_score,
    players: Array.isArray(row.players) ? row.players : [],
  };
}

export async function readLiveSnapshots(pb: Pick<PocketBase, "collection">, season: string, round: number): Promise<LiveSnapshot[]> {
  const rows = await pb.collection("live_game_snapshots").getFullList<StoredSnapshot>({
    filter: `season = '${season}' && round = ${round}`,
    requestKey: null,
  });
  return rows.map(asLiveSnapshot);
}

/** One upsert per game. Unchanged data gets a freshness heartbeat every 3 min. */
export async function upsertLiveSnapshot(pb: Pick<PocketBase, "collection">, input: {
  season: string;
  gameCode: number;
  round: number;
  checkedAt: string;
  game: LiveGame;
}): Promise<"created" | "updated" | "unchanged"> {
  const collection = pb.collection("live_game_snapshots");
  const filter = `season = '${input.season}' && game_code = ${input.gameCode}`;
  const existing = await collection.getFullList<StoredSnapshot>({ filter, requestKey: null });
  const current = existing[0];
  const body = {
    season: input.season,
    game_code: input.gameCode,
    round: input.round,
    live: input.game.live,
    local_score: input.game.localScore,
    road_score: input.game.roadScore,
    players: input.game.players,
    checked_at: input.checkedAt,
  };
  if (current) {
    const same = current.live === body.live && current.local_score === body.local_score
      && current.road_score === body.road_score && JSON.stringify(current.players) === JSON.stringify(body.players);
    const age = Date.parse(input.checkedAt) - Date.parse(current.checked_at);
    if (same && age >= 0 && age < 3 * 60_000) return "unchanged";
    await collection.update(current.id, body, { requestKey: null });
    return "updated";
  }
  try {
    await collection.create(body, { requestKey: null });
    return "created";
  } catch (error) {
    const code = (error as { response?: { data?: Record<string, { code?: string }> } })?.response?.data;
    if (!Object.values(code ?? {}).some((field) => field.code === "validation_not_unique")) throw error;
    const raced = await collection.getFullList<StoredSnapshot>({ filter, requestKey: null });
    if (!raced[0]) throw error;
    await collection.update(raced[0].id, body, { requestKey: null });
    return "updated";
  }
}
