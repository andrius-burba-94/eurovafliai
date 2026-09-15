/**
 * Storing what a news pass decided — slice 9.4.
 *
 * Framework-free: the worker runs this and a worker cannot import a
 * `"use server"` module. The rules are all in `items.ts`; this file only
 * carries the plan out, and it is where the no-transactions story is told.
 *
 * ## Failure recovery
 *
 * Order is items first, statuses last, and both halves are idempotent:
 *
 * - An item is keyed on `unique(source, source_key)`, so a pass that dies
 *   halfway has stored a prefix and the next pass plans exactly the remainder.
 *   A create that loses the race to another pass is re-read and updated rather
 *   than failing the pass.
 * - A status write is one field on one player, guarded by `applied` on the item
 *   that caused it. A crash between the item and the status leaves the item
 *   stored with `applied: false`, and the next pass applies it — which is the
 *   safe direction, because the opposite would flag a player and forget why.
 */

import type PocketBase from "pocketbase";

import type { NewsPlan, StoredNewsItem } from "./items";

export type NewsPb = Pick<PocketBase, "collection">;

export type AppliedNews = {
  created: number;
  updated: number;
  unchanged: number;
  flagged: number;
  failures: string[];
};

/** Every stored item, newest first. Fewer than a thousand rows in a season. */
export async function readStoredNews(
  pb: NewsPb,
  source = "rotowire",
): Promise<StoredNewsItem[]> {
  return pb.collection("player_news").getFullList<StoredNewsItem>({
    filter: `source = '${source}'`,
    sort: "-published",
    requestKey: null,
  });
}

/** The pool, as the matcher and the status rules need it. */
export async function readNewsPlayers(pb: NewsPb) {
  return pb
    .collection("players")
    .getFullList<{
      id: string;
      name: string;
      name_normalized: string;
      club_code: string;
      status: string;
      manual_lock?: boolean;
    }>({
      fields: "id,name,name_normalized,club_code,status,manual_lock",
      requestKey: null,
    });
}

function unique(error: unknown): boolean {
  const data = (error as { response?: { data?: Record<string, { code?: string }> } })
    ?.response?.data;
  return Object.values(data ?? {}).some(
    (field) => field?.code === "validation_not_unique",
  );
}

export async function applyNewsPlan(
  pb: NewsPb,
  plan: NewsPlan,
): Promise<AppliedNews> {
  const applied: AppliedNews = {
    created: 0,
    updated: 0,
    unchanged: plan.unchanged,
    flagged: 0,
    failures: [],
  };

  for (const row of plan.creates) {
    try {
      await pb.collection("player_news").create(row, { requestKey: null });
      applied.created += 1;
    } catch (error) {
      if (unique(error)) {
        // Another pass stored it between our read and our write. The row is
        // there and says the same thing, which is the outcome we wanted.
        applied.unchanged += 1;
        continue;
      }
      applied.failures.push(
        `Could not store "${row.headline}" (${row.name}): ${describe(error)}`,
      );
    }
  }

  for (const change of plan.updates) {
    try {
      await pb
        .collection("player_news")
        .update(change.id, change.fields as Record<string, unknown>, {
          requestKey: null,
        });
      applied.updated += 1;
    } catch (error) {
      applied.failures.push(`Could not update an item: ${describe(error)}`);
    }
  }

  for (const change of plan.statusChanges) {
    try {
      await pb
        .collection("players")
        .update(change.playerId, { status: change.to }, { requestKey: null });
      applied.flagged += 1;
    } catch (error) {
      applied.failures.push(
        `Could not mark ${change.playerName} ${change.to}: ${describe(error)}`,
      );
    }
  }

  return applied;
}

/**
 * Attach every item published under one slug to one player.
 *
 * The mapping queue's answer: it names a slug, not an item, because the slug is
 * what the next item will arrive under. Deliberately does NOT apply a status —
 * the items keep `applied: false`, so the next pass decides that under the same
 * recency and lock rules everything else does.
 */
export async function attachSlug(
  pb: NewsPb,
  slug: string,
  playerId: string,
  source = "rotowire",
): Promise<number> {
  const items = await pb
    .collection("player_news")
    .getFullList<{ id: string }>({
      filter: `source = '${source}' && slug = '${slug}'`,
      fields: "id",
      requestKey: null,
    });

  let attached = 0;
  for (const item of items) {
    await pb
      .collection("player_news")
      .update(item.id, { player: playerId }, { requestKey: null });
    attached += 1;
  }
  return attached;
}

/**
 * Mark every stored item about a player as spent.
 *
 * What "he is fit again" has to do beyond the status itself: an item that
 * flagged somebody is three weeks' worth of reason for the next pass to flag
 * them again, and a correction that gets undone within the hour is worse than
 * no correction.
 */
export async function spendItemsFor(
  pb: NewsPb,
  playerId: string,
): Promise<number> {
  const items = await pb
    .collection("player_news")
    .getFullList<{ id: string; applied?: boolean }>({
      filter: `player = '${playerId}'`,
      fields: "id,applied",
      requestKey: null,
    });

  let spent = 0;
  for (const item of items) {
    if (item.applied === true) continue;
    await pb
      .collection("player_news")
      .update(item.id, { applied: true }, { requestKey: null });
    spent += 1;
  }
  return spent;
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
