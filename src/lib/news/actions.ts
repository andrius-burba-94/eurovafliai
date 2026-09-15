"use server";

import { revalidatePath } from "next/cache";

import { getSuperuserClient } from "@/lib/pb/superuser";
import { canManageRosters } from "@/lib/rosters/actions";

import { ingestNews } from "./ingest";
import { attachSlug, spendItemsFor } from "./store";

/**
 * The two acts 9.4's news needs a person for.
 *
 * Both are commissioner-side and both are corrections rather than routine: the
 * hourly pass does the routine part, and these exist for what it cannot know.
 */

export type NewsResult = {
  error: string | null;
  /** What just happened, in one sentence, when it worked. */
  done?: string;
};

const DENIED: NewsResult = {
  error:
    "Only the commissioner, or someone they trust with the pool, can answer news.",
};

/**
 * "This published name is this player."
 *
 * Answers the publisher's **slug**, not one item, so every item about them —
 * the three already stored and the one that arrives next Tuesday — attaches
 * from one answer.
 *
 * Deliberately does not flag anybody: the items stay unapplied and the next
 * pass decides their status under the same recency, lock and `left` rules
 * every other item goes through. Mapping a name is a statement about identity,
 * not about a knee.
 */
export async function attachNewsName(
  _previous: NewsResult,
  formData: FormData,
): Promise<NewsResult> {
  if (!(await canManageRosters())) return DENIED;

  const slug = String(formData.get("slug") ?? "");
  const playerId = String(formData.get("player") ?? "");
  if (!slug || !playerId) return { error: "Pick a player for that name first." };

  const pb = await getSuperuserClient();
  const player = await pb
    .collection("players")
    .getOne<{ id: string; name: string }>(playerId, { requestKey: null })
    .catch(() => null);
  if (!player) return { error: "That player is no longer in the pool." };

  const attached = await attachSlug(pb, slug, playerId);

  revalidatePath("/players/mapping");
  revalidatePath("/players/news");
  revalidatePath(`/players/${playerId}`);

  return {
    error: null,
    done: `${attached} item${attached === 1 ? "" : "s"} now belong${attached === 1 ? "s" : ""} to ${player.name}. The next pass decides whether any of them changes their status.`,
  };
}

/**
 * "He is fit again."
 *
 * The one thing the source cannot tell us. Both pages carry the latest 25
 * *updates* rather than a census of who is hurt, so a player disappearing from
 * them proves nothing and nothing here ever heals anybody automatically.
 *
 * Two writes, in the order that makes a half-finished run harmless: the items
 * are spent first, then the status. A crash between them leaves a fit player
 * still marked injured and the items unable to re-flag him — one more press
 * finishes it. The other order would clear the flag and leave three weeks of
 * reason for the next pass to put it straight back.
 */
export async function markPlayerFit(
  _previous: NewsResult,
  formData: FormData,
): Promise<NewsResult> {
  if (!(await canManageRosters())) return DENIED;

  const playerId = String(formData.get("player") ?? "");
  if (!playerId) return { error: "Say which player is fit." };

  const pb = await getSuperuserClient();
  const player = await pb
    .collection("players")
    .getOne<{ id: string; name: string; status: string; manual_lock?: boolean }>(
      playerId,
      { requestKey: null },
    )
    .catch(() => null);
  if (!player) return { error: "That player is no longer in the pool." };
  if (player.status === "left") {
    return {
      error: `${player.name} is marked as having left the league, which is not an injury. A roster sync is what brings them back.`,
    };
  }
  if (player.status === "active") {
    return { error: `${player.name} is already available.` };
  }

  await spendItemsFor(pb, playerId);
  await pb
    .collection("players")
    .update(playerId, { status: "active" }, { requestKey: null });

  revalidatePath("/players/news");
  revalidatePath("/players");
  revalidatePath(`/players/${playerId}`);

  return {
    error: null,
    done: `${player.name} is available again. The stored items stay, and none of them will flag them a second time.`,
  };
}

/**
 * Read the pages now, rather than waiting for the hour.
 *
 * The draft-night button: the worker reads hourly, and the hour before a draft
 * is the one hour where waiting forty minutes for a knee is not acceptable.
 */
export async function refreshNews(): Promise<NewsResult> {
  if (!(await canManageRosters())) return DENIED;

  const pb = await getSuperuserClient();
  try {
    const report = await ingestNews({ pb });
    revalidatePath("/players/news");
    revalidatePath("/players");
    revalidatePath("/players/mapping");

    const parts = [`${report.read} item(s) read`];
    if (report.created) parts.push(`${report.created} new`);
    if (report.flagged) parts.push(`${report.flagged} player(s) flagged`);
    if (report.unmatched) parts.push(`${report.unmatched} name(s) unmatched`);
    return {
      error: report.problems[0] ?? null,
      done: parts.join(" · "),
    };
  } catch (error) {
    return {
      error: `The news pages could not be read: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
