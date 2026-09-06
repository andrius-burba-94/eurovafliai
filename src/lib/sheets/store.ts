import type PocketBase from "pocketbase";

import {
  DRAFTABLE_PLAYERS_FILTER,
  isUniqueViolation,
} from "@/lib/drafts/pipeline";
import type { Position } from "@/lib/engine";

import type { MatchablePlayer } from "./match";
import type { SheetRanking } from "./ranking";

/**
 * Reading and writing a cheat sheet — the PocketBase half, and nothing else.
 *
 * Deliberately **framework-free**, like `src/lib/drafts/pipeline.ts` and for
 * the same reason: the worker autodrafts from a sheet, and a worker cannot
 * import a `"use server"` module — it would drag in `next/cache` and
 * `server-only` and throw on the first line. So this takes a PocketBase client
 * and does as it is told, and the two callers that need a sheet (the draft
 * room's `getDraftView`, with the viewer's own token, and the sweep, with the
 * superuser's) read it through the same function.
 *
 * ## Failure recovery
 *
 * One write. `saveSheet` is an upsert, so a sheet either moved or it did not;
 * there is no intermediate state to repair. The single race it can lose is two
 * saves creating the same row at once, which the `unique(member)` index
 * refuses — and the loser then re-reads and updates, which is the outcome both
 * writers wanted. A sheet is also the one piece of draft-adjacent state where a
 * lost write costs nothing structural: autodraft falls through to its own
 * ranking, exactly as it does for a member who never wrote a sheet.
 */

export type SheetRecord = {
  id: string;
  member: string;
  ranking?: unknown;
  tiers?: unknown;
  source?: string;
  updated?: string;
};

/** A stored sheet, or null when this member has never written one. */
export type StoredSheet = SheetRanking & {
  readonly source: "csv" | "manual";
  /** The record's own id, so a save can update rather than search again. */
  readonly id: string;
};

/**
 * A JSON column is whatever was last written to it, and this one is read by
 * autodraft. So it is validated on the way out rather than trusted: a `null`, a
 * number or an object in `ranking` would reach `rankForMember` as a player id
 * and be looked up in a `Map`, where it would silently miss — turning a
 * member's whole sheet into "no sheet" with nothing anywhere saying so.
 */
function asIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.length > 0,
  );
}

function asBreaks(value: unknown, size: number): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item): item is number =>
        typeof item === "number" &&
        Number.isInteger(item) &&
        item > 0 &&
        item < size,
    )
    .sort((a, b) => a - b)
    .filter((item, index, all) => all.indexOf(item) === index);
}

export async function readSheet(
  pb: PocketBase,
  memberId: string,
): Promise<StoredSheet | null> {
  const records = await pb.collection("cheat_sheets").getFullList<SheetRecord>({
    filter: `member = '${memberId}'`,
    requestKey: null,
  });
  const record = records[0];
  if (!record) return null;

  const ranking = asIds(record.ranking);
  return {
    id: record.id,
    ranking,
    tiers: asBreaks(record.tiers, ranking.length),
    source: record.source === "manual" ? "manual" : "csv",
  };
}

/**
 * Write the sheet, creating it the first time.
 *
 * The read before the write is not a validation — `readSheet` is the only way
 * to learn the record id, since the sheet is keyed on the membership rather
 * than on anything the caller holds. A create that loses the index race falls
 * back to reading again and updating, which is why this is safe to call twice.
 */
export async function saveSheet(
  pb: PocketBase,
  memberId: string,
  { ranking, tiers }: SheetRanking,
  source: "csv" | "manual",
): Promise<void> {
  const existing = await readSheet(pb, memberId);
  const body = { member: memberId, ranking, tiers, source };

  if (existing) {
    await pb
      .collection("cheat_sheets")
      .update(existing.id, body, { requestKey: null });
    return;
  }

  try {
    await pb.collection("cheat_sheets").create(body, { requestKey: null });
  } catch (error) {
    if (!isUniqueViolation(error)) throw error;
    // Somebody else created it in the window between the read and the write —
    // two tabs, or a double submit. The index said no; the sheet they wanted is
    // still the sheet we want, so update the row that won.
    const now = await readSheet(pb, memberId);
    if (!now) throw error;
    await pb
      .collection("cheat_sheets")
      .update(now.id, body, { requestKey: null });
  }
}

/** Throw the sheet away, leaving the member with no sheet rather than an empty one. */
export async function deleteSheet(
  pb: PocketBase,
  memberId: string,
): Promise<void> {
  const existing = await readSheet(pb, memberId);
  if (!existing) return;
  await pb.collection("cheat_sheets").delete(existing.id, { requestKey: null });
}

/**
 * The draftable pool, in the shape the matcher reads.
 *
 * Filtered by `DRAFTABLE_PLAYERS_FILTER`, the same one the room's pool and the
 * sweep's autodraft pool use. A sheet that could name a player the room would
 * never offer is a sheet whose top pick silently does nothing.
 */
export async function readMatchablePool(
  pb: PocketBase,
): Promise<MatchablePlayer[]> {
  const players = await pb.collection("players").getFullList<{
    id: string;
    name: string;
    name_normalized?: string;
    club_code: string;
    position: Position;
  }>({
    filter: DRAFTABLE_PLAYERS_FILTER,
    sort: "name",
    requestKey: null,
  });
  return players.map((player) => ({
    id: player.id,
    name: player.name,
    normalized: player.name_normalized ?? "",
    club: player.club_code,
    position: player.position,
  }));
}
