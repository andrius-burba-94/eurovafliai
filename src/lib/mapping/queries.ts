import "server-only";

import { serverConfig } from "@/lib/config/server";
import { getSuperuserClient } from "@/lib/pb/superuser";
import { normalizeName } from "@/lib/rosters/normalize";
import { rankCandidates } from "@/lib/rosters/rename";
import {
  codesWorthChasing,
  newestCheckBatch,
  newsWorthChasing,
  pendingCodes,
  pendingNewsNames,
  pendingRenames,
  type CodeBatch,
  type MappingQueue,
  type NewsItemRow,
  type PendingCode,
  type PoolPlayerRow,
  type RenameBatch,
  type StoredCheck,
  type UnmatchedCode,
  type UnmatchedNewsName,
} from "./queue";

/**
 * What the mapping page needs to render — slice 4.2.
 *
 * The unmatched-code half is read from **stored `stat_imports` batches** rather
 * than recomputed: 4.3 already wrote down every code it could not attach, with
 * the games it appeared in and the name the feed used, and re-deriving that
 * would mean re-fetching box scores to learn something already recorded. This
 * is the audit trail being used as an audit trail.
 *
 * The rename half is read from **the newest stored check**, with its age shown.
 * The first draft did not read it at all, on the grounds that a stale proposal
 * invites somebody to confirm a merge against a pool that has moved — but that
 * risk is answered where it has to be answered anyway: `confirmRename`
 * re-validates against live player rows and refuses a code that has since been
 * taken. What the first draft actually produced was worse: resolve three of
 * fifteen, navigate away, come back to nothing, and pay 21 more requests to see
 * the other twelve again.
 *
 * So the page shows the last check and says when it was taken; `checkTheFeed`
 * replaces it. Both halves are then reachable without a network, which is also
 * what makes the confirm and reject guards testable in a browser.
 *
 * Everything that decides whether a row is still a *question* lives in
 * `./queue.ts` and is pure, because the doorbell counts the same queue this
 * page renders and the two must not be able to disagree.
 */

export type { StoredCheck, UnmatchedCode } from "./queue";

/** A published name, with the pool players it might be — 9.4. */
export type UnmatchedNews = UnmatchedNewsName & {
  readonly candidates: UnmatchedCode["candidates"];
};

/**
 * A stored feed check — the one named, or the newest, or null.
 *
 * `batchId` addresses one directly. That exists for two reasons and both are
 * real: a check is an audit record worth being able to return to by link, and
 * "the newest check" is **app-global** — which made two parallel specs, each
 * planting its own check, silently answer each other's questions. Every
 * app-global read in this repo has now taught the same lesson at least once
 * (`sweepOnce`, the cheat-sheet fixture, the chat fixture).
 */
export async function readLatestCheck(
  batchId?: string,
): Promise<StoredCheck | null> {
  const pb = await getSuperuserClient();

  let batch: RenameBatch | undefined;
  if (batchId) {
    batch =
      (await pb
        .collection("roster_imports")
        .getOne<RenameBatch>(batchId, { requestKey: null })
        .catch(() => undefined)) ?? undefined;
    if ((batch?.diff?.renames?.length ?? 0) === 0) batch = undefined;
  } else {
    batch = newestCheckBatch(await readCheckBatches(pb));
  }
  if (!batch) return null;

  const players = await pb
    .collection("players")
    .getFullList<PoolPlayerRow>({ requestKey: null });

  return {
    batchId: batch.id,
    checkedAt: batch.created,
    renames: pendingRenames(batch, players),
    adds: batch.diff?.adds?.length ?? 0,
    leaving: batch.diff?.leaving?.length ?? 0,
  };
}

/** Every code recent imports could not attach, with the players it might be. */
export async function readUnmatchedCodes(limit = 20): Promise<UnmatchedCode[]> {
  const pb = await getSuperuserClient();

  const [batches, players] = await Promise.all([
    readCodeBatches(pb, limit),
    pb.collection("players").getFullList<PoolPlayerRow>({ requestKey: null }),
  ]);

  return pendingCodes(batches, players).map((entry) => ({
    ...entry,
    candidates: suggest(entry, players),
  }));
}

/**
 * Every published name the pool cannot resolve, with who it might be — 9.4.
 *
 * Candidates are ranked across the **whole** pool rather than narrowed by
 * club, unlike the codes half above. A box score knows which side a line was
 * on in the Euroleague's own vocabulary; a publisher's club names are its own
 * ("Free Agent" is one of them), so narrowing by club here would be guessing
 * with extra steps. Players who already have a person code are still
 * candidates, because this attaches a publisher's slug rather than a code —
 * there is no second-code trap to avoid.
 */
export async function readUnmatchedNews(): Promise<UnmatchedNews[]> {
  const pb = await getSuperuserClient();

  const [items, players] = await Promise.all([
    pb.collection("player_news").getFullList<NewsItemRow>({
      fields: "id,slug,name,club_name,headline,published,player,url",
      requestKey: null,
    }),
    pb.collection("players").getFullList<PoolPlayerRow>({ requestKey: null }),
  ]);

  return pendingNewsNames(items).map((name) => ({
    ...name,
    candidates: rankCandidates(
      normalizeName(name.name),
      players.map((player) => ({
        key: player.name_normalized ?? normalizeName(player.name),
        value: player,
      })),
    )
      .slice(0, 6)
      .map((player) => ({
        id: player.id,
        name: player.name,
        clubCode: player.club_code,
        hasCode: Boolean(player.person_code),
      })),
  }));
}

/**
 * How much unanswered mapping work is standing — the doorbell on 4.2's queue.
 *
 * Cheap on purpose: three PocketBase reads and no network. The feed is only
 * ever touched by `checkTheFeed` behind a button, so this is safe to call on a
 * page somebody opens all day.
 *
 * It reads the pool **once** and runs both filters over it, where the two page
 * reads fetch it twice, and it never ranks candidates — a count does not need
 * to know who the player might be, and `suggest` builds a fuse index per code.
 *
 * Only **this season's** unmatched codes are counted, which a full E2025
 * backfill is what proved necessary: it leaves 123 codes that are not work,
 * because they belong to players who left the league. See `codesWorthChasing`.
 *
 * It throws what PocketBase throws. Callers that render this beside something
 * else fall back to `EMPTY_QUEUE`, the way the lobby already does with chat: a
 * doorbell is not worth a surface.
 */
export async function countMappingQueue(limit = 20): Promise<MappingQueue> {
  const pb = await getSuperuserClient();
  const season = serverConfig().EUROLEAGUE_SEASON;

  const [checkBatches, codeBatches, players, news] = await Promise.all([
    readCheckBatches(pb),
    readCodeBatches(pb, limit),
    pb.collection("players").getFullList<PoolPlayerRow>({ requestKey: null }),
    pb.collection("player_news").getFullList<NewsItemRow>({
      fields: "id,slug,name,club_name,headline,published,player,url",
      requestKey: null,
    }),
  ]);

  return {
    renames: pendingRenames(newestCheckBatch(checkBatches), players).length,
    codes: codesWorthChasing(pendingCodes(codeBatches, players), season).length,
    news: newsWorthChasing(pendingNewsNames(news), new Date()).length,
  };
}

type PbClient = Awaited<ReturnType<typeof getSuperuserClient>>;

/**
 * The last few `roster_imports` batches, newest first.
 *
 * Ten rather than one: a sync writes batches too, so the newest batch and the
 * newest batch carrying renames are different rows.
 */
async function readCheckBatches(pb: PbClient): Promise<RenameBatch[]> {
  const batches = await pb
    .collection("roster_imports")
    .getList<RenameBatch>(1, 10, { sort: "-created", requestKey: null });
  return batches.items;
}

async function readCodeBatches(
  pb: PbClient,
  limit: number,
): Promise<CodeBatch[]> {
  const batches = await pb
    .collection("stat_imports")
    .getList<CodeBatch>(1, limit, { sort: "-created", requestKey: null });
  return batches.items;
}

/**
 * Pool players an unmatched code might belong to.
 *
 * Ranked by the same fuse helper the rename pass uses, and **restricted to
 * players with no code of their own** — a player who already has a code is not
 * a candidate for a second one, and offering them would invite exactly the
 * two-codes-on-one-player state the pipeline refuses elsewhere.
 *
 * Club narrows it when the source told us one. It usually did: a box score
 * knows which side a line was on.
 */
function suggest(
  entry: PendingCode,
  players: readonly PoolPlayerRow[],
): UnmatchedCode["candidates"] {
  if (!entry.name) return [];

  const codeless = players.filter((player) => !player.person_code);
  const pool = entry.clubCode
    ? codeless.filter((player) => player.club_code === entry.clubCode)
    : codeless;
  if (pool.length === 0) return [];

  const ranked = rankCandidates(
    normalizeName(entry.name),
    pool.map((player) => ({
      key: player.name_normalized ?? normalizeName(player.name),
      value: player,
    })),
  );

  return ranked.slice(0, 6).map((player) => ({
    id: player.id,
    name: player.name,
    clubCode: player.club_code,
    hasCode: Boolean(player.person_code),
  }));
}
