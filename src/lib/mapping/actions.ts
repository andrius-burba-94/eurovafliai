"use server";

import { revalidatePath } from "next/cache";

import { getSuperuserClient } from "@/lib/pb/superuser";
import { getSafeActionError } from "@/lib/safe-error";
import { readCurrentPlayers } from "@/lib/rosters/apply";
import { diffRosters } from "@/lib/rosters/diff";
import { fetchSeasonRosters } from "@/lib/rosters/euroleague";
import { canManageRosters } from "@/lib/rosters/actions";
import type { RenameProposal } from "@/lib/rosters/rename";
import { ingestFinishedGames } from "@/lib/stats/ingest";

/**
 * Player mapping — slice 4.2.
 *
 * Two questions, asked from opposite directions, answered on one surface:
 *
 * - **A stored player with no person code, and an arrival that might be them.**
 *   `diffRosters` quarantines the likely pairs rather than writing an add and a
 *   departure for one human (see `src/lib/rosters/rename.ts` for the thirteen
 *   real cases that made this necessary). Confirming here is what un-sticks
 *   them.
 * - **A person code in a box score that matches no player.** 4.3's first live
 *   pass reported 21 of them. Attaching the code to the right player is the
 *   fix, and it has to be followed by re-importing the games that mentioned it,
 *   or the lines that were refused before the code existed never arrive.
 *
 * ## Proposals are computed once and stored, not recomputed per click
 *
 * Checking the feed is 21 requests. Doing that again on every confirm would be
 * 21 × 12 for one afternoon's reconciliation, which is well past the rate limit
 * this feed turned out to have. So `checkTheFeed` stores a **report-only
 * `roster_imports` batch** — exactly what D8 built batches for — and each
 * confirm reads its plan back. That also means the client never tells the
 * server what a player's new name and code are: it names a batch and a pair,
 * and the server acts on what *it* computed.
 *
 * ## Failure recovery
 *
 * A confirm is **one write** to one player row, so there is no intermediate
 * state. A reject is two writes (create the arrival, mark the stored row left)
 * and is the one place here that can half-finish: a crash between them leaves
 * the arrival created and the old row still active, which the next sync reports
 * as a departure again — the same question, asked again, with nothing lost.
 *
 * Every confirm re-validates against live state rather than trusting the
 * stored plan: the player must still exist, must still have no code, and the
 * code must not already belong to somebody else. That last one is the guard
 * that matters, because two mappings both pointing at one arrival would
 * otherwise write one `person_code` onto two players — and then box scores
 * would attach to whichever the filter happened to return first.
 */

export type MappingResult = {
  error: string | null;
  /** What just happened, in one sentence, when it worked. */
  done?: string;
  /** The id of the player that changed, so a surface can settle that row. */
  playerId?: string;
};

const DENIED: MappingResult = {
  error: "Only the commissioner, or someone they trust with it, can map players.",
};

/** As much of a proposal as travels to the browser and back. */
export type StoredRename = {
  readonly existingId: string;
  readonly existingName: string;
  readonly clubCode: string;
  readonly incomingName: string;
  readonly personCode: string;
  readonly confidence: RenameProposal["confidence"];
  readonly reason: string;
  readonly alternatives: { name: string; personCode: string }[];
};

export type FeedCheck = {
  error: string | null;
  batchId?: string;
  renames?: StoredRename[];
  /** Counts, so the surface can say what the sync would otherwise have done. */
  adds?: number;
  leaving?: number;
  checkedAt?: string;
};

const asStored = (proposal: RenameProposal): StoredRename => ({
  existingId: proposal.existing.id,
  existingName: proposal.existing.name,
  clubCode: proposal.existing.club_code,
  incomingName: proposal.incoming.name,
  personCode: proposal.incoming.person_code ?? "",
  confidence: proposal.confidence,
  reason: proposal.reason,
  alternatives: proposal.alternatives
    .filter((row) => row.person_code)
    .map((row) => ({ name: row.name, personCode: row.person_code! })),
});

/**
 * Ask the feed what it says today, and store the answer.
 *
 * Writes **nothing** to `players` — the batch is `applied: false`, which is the
 * same thing a report-only sync under the other authority produces, and it is
 * read back by the confirms below.
 */
export async function checkTheFeed(): Promise<FeedCheck> {
  if (!(await canManageRosters())) return { error: DENIED.error };

  const season = process.env.EUROLEAGUE_SEASON ?? "E2026";
  let rows;
  try {
    ({ rows } = await fetchSeasonRosters({ season }));
  } catch (error) {
    return {
      error: getSafeActionError(error, "The feed did not answer. Try again."),
    };
  }
  if (rows.length === 0) {
    return {
      error:
        "The feed returned no players at all, so everything would look like a departure. Nothing was stored.",
    };
  }

  const pb = await getSuperuserClient();
  const current = await readCurrentPlayers(pb);
  const diff = diffRosters({ current, incoming: rows });

  const batch = await pb.collection("roster_imports").create<{ id: string }>(
    {
      source: "api",
      season,
      applied: false,
      rows: rows.length,
      diff,
      log: `Mapping check. ${diff.renames.length} suspected rename(s) held back; ${diff.adds.length} adds and ${diff.leaving.length} departures would otherwise apply.`,
    },
    { requestKey: null },
  );

  revalidatePath("/players/mapping");

  return {
    error: null,
    batchId: batch.id,
    renames: diff.renames.map(asStored),
    adds: diff.adds.length,
    leaving: diff.leaving.length,
    checkedAt: new Date().toISOString(),
  };
}

type BatchRecord = { id: string; diff?: unknown; log?: string };

/** Read one proposal back out of a stored batch. */
async function readProposal(
  pb: Awaited<ReturnType<typeof getSuperuserClient>>,
  batchId: string,
  existingId: string,
  personCode: string,
): Promise<RenameProposal | null> {
  const batch = await pb
    .collection("roster_imports")
    .getOne<BatchRecord>(batchId, { requestKey: null })
    .catch(() => null);
  const renames = (batch?.diff as { renames?: RenameProposal[] } | undefined)
    ?.renames;
  if (!Array.isArray(renames)) return null;

  return (
    renames.find(
      (proposal) =>
        proposal.existing?.id === existingId &&
        // The chosen code, which for a `candidate` may be an alternative rather
        // than the one the proposal suggested.
        (proposal.incoming?.person_code === personCode ||
          proposal.alternatives?.some(
            (row) => row.person_code === personCode,
          )),
    ) ?? null
  );
}

/**
 * "Yes, these are the same player."
 *
 * Keeps the stored row's **id** and takes the feed's name, code, club and
 * position. Keeping the id is the entire reason this exists: picks, cheat
 * sheets, roster memberships and box scores all reference it, so a merge is
 * invisible to every one of them while a delete-and-recreate would break all
 * four.
 */
export async function confirmRename(
  _previous: MappingResult,
  formData: FormData,
): Promise<MappingResult> {
  if (!(await canManageRosters())) return DENIED;

  const batchId = String(formData.get("batch") ?? "");
  const existingId = String(formData.get("player") ?? "");
  const personCode = String(formData.get("code") ?? "");
  if (!batchId || !existingId || !personCode) {
    return { error: "That mapping is incomplete. Check the feed again." };
  }

  const pb = await getSuperuserClient();
  const proposal = await readProposal(pb, batchId, existingId, personCode);
  if (!proposal) {
    return {
      error:
        "That proposal is not in the stored check any more. Check the feed again — the pool may have moved underneath it.",
    };
  }

  const incoming =
    proposal.incoming.person_code === personCode
      ? proposal.incoming
      : // A candidate resolved to one of its alternatives.
        proposal.alternatives.find((row) => row.person_code === personCode);
  if (!incoming) {
    return { error: "That arrival is not one of the choices offered." };
  }

  const current = await readCurrentPlayers(pb);
  const player = current.find((row) => row.id === existingId);
  if (!player) {
    return { error: "That player is no longer in the pool." };
  }
  if (player.manual_lock) {
    return {
      error: `${player.name} carries a manual lock, so neither source may change them. Clear the lock first.`,
    };
  }
  if (player.person_code && player.person_code !== personCode) {
    return {
      error: `${player.name} already has person code ${player.person_code}. Two codes on one player is the case the pipeline refuses by design — resolve it by hand.`,
    };
  }

  const clash = current.find(
    (row) => row.id !== existingId && row.person_code === personCode,
  );
  if (clash) {
    return {
      error: `Person code ${personCode} already belongs to ${clash.name}. Mapping it here would put one code on two players, and box scores would attach to whichever came back first.`,
    };
  }

  await pb.collection("players").update(
    existingId,
    {
      name: incoming.name,
      name_normalized: incoming.name_normalized,
      person_code: personCode,
      club_code: incoming.club_code,
      club_name: incoming.club_name,
      position: incoming.position,
      dorsal: incoming.dorsal,
      // A merge is not a return from the dead: whatever local status the row
      // carried — `injured`, `doubtful` — is knowledge the feed does not have.
      // Only a row that had been marked `left` is revived, because the feed
      // listing them is the evidence that they are back.
      ...(player.status === "left" ? { status: "active" } : {}),
      source: "api",
    },
    { requestKey: null },
  );

  await appendToBatchLog(
    pb,
    batchId,
    `Confirmed: ${player.name} → ${incoming.name} (code ${personCode}).`,
  );

  revalidatePath("/players/mapping");
  revalidatePath("/players");

  return {
    error: null,
    playerId: existingId,
    done: `${player.name} is now ${incoming.name}, with person code ${personCode}. Their picks, sheets and box scores are untouched.`,
  };
}

/**
 * "No, these are two different people."
 *
 * Does what the sync would have done if it had never suspected anything: adds
 * the arrival as its own player and marks the stored row as having left. So a
 * rejection **resolves** the quarantine rather than deferring it — and because
 * `diffRosters` skips a row that is already `left`, the same pair is never
 * proposed again.
 */
export async function rejectRename(
  _previous: MappingResult,
  formData: FormData,
): Promise<MappingResult> {
  if (!(await canManageRosters())) return DENIED;

  const batchId = String(formData.get("batch") ?? "");
  const existingId = String(formData.get("player") ?? "");
  const personCode = String(formData.get("code") ?? "");

  const pb = await getSuperuserClient();
  const proposal = await readProposal(pb, batchId, existingId, personCode);
  if (!proposal) {
    return {
      error:
        "That proposal is not in the stored check any more. Check the feed again.",
    };
  }

  const current = await readCurrentPlayers(pb);
  const player = current.find((row) => row.id === existingId);
  if (!player) return { error: "That player is no longer in the pool." };

  const incoming =
    proposal.incoming.person_code === personCode
      ? proposal.incoming
      : proposal.alternatives.find((row) => row.person_code === personCode);
  if (!incoming) return { error: "That arrival is not one of the choices." };

  // The arrival first. If this is the second run of a reject that half-failed,
  // the code is already taken — by the row we created — and that is a success,
  // not a clash.
  const already = current.find((row) => row.person_code === personCode);
  if (!already) {
    await pb.collection("players").create(
      {
        name: incoming.name,
        name_normalized: incoming.name_normalized,
        club_code: incoming.club_code,
        club_name: incoming.club_name,
        position: incoming.position,
        status: "active",
        person_code: personCode,
        source: "api",
        dorsal: incoming.dorsal,
        manual_lock: false,
      },
      { requestKey: null },
    );
  }

  if (player.status !== "left" && !player.manual_lock) {
    await pb
      .collection("players")
      .update(existingId, { status: "left" }, { requestKey: null });
  }

  await appendToBatchLog(
    pb,
    batchId,
    `Rejected: ${player.name} and ${incoming.name} are different people. ${incoming.name} added; ${player.name} marked left.`,
  );

  revalidatePath("/players/mapping");
  revalidatePath("/players");

  return {
    error: null,
    playerId: existingId,
    done: `${incoming.name} was added as a new player and ${player.name} is marked as having left.`,
  };
}

/**
 * Attach a person code from a box score to a player who has none.
 *
 * Then **re-import the games that mentioned it**. Without that second half the
 * mapping is cosmetic: those games already count as stored, so the fetcher's
 * "played and not stored" pass would never go back for the lines it refused.
 * The re-import is bounded to the games the code actually appeared in, which
 * the stored `stat_imports` plan already records.
 */
export async function attachStatCode(
  _previous: MappingResult,
  formData: FormData,
): Promise<MappingResult> {
  if (!(await canManageRosters())) return DENIED;

  const playerId = String(formData.get("player") ?? "");
  const personCode = String(formData.get("code") ?? "");
  const games = String(formData.get("games") ?? "")
    .split(",")
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isInteger(value) && value > 0);

  if (!playerId || !personCode) {
    return { error: "Pick a player and a code first." };
  }

  const pb = await getSuperuserClient();
  const current = await readCurrentPlayers(pb);
  const player = current.find((row) => row.id === playerId);
  if (!player) return { error: "That player is no longer in the pool." };
  if (player.manual_lock) {
    return {
      error: `${player.name} carries a manual lock. Clear it first.`,
    };
  }
  if (player.person_code && player.person_code !== personCode) {
    return {
      error: `${player.name} already has person code ${player.person_code}. Resolve that by hand rather than overwriting it.`,
    };
  }
  const clash = current.find(
    (row) => row.id !== playerId && row.person_code === personCode,
  );
  if (clash) {
    return {
      error: `Person code ${personCode} already belongs to ${clash.name}.`,
    };
  }

  await pb
    .collection("players")
    .update(playerId, { person_code: personCode }, { requestKey: null });

  let imported = "";
  if (games.length > 0) {
    try {
      const report = await ingestFinishedGames({
        pb,
        season: process.env.EUROLEAGUE_SEASON ?? "E2026",
        onlyGames: games,
        maxGames: games.length,
      });
      imported = ` ${report.created} game line${report.created === 1 ? "" : "s"} arrived from the ${games.length} game${games.length === 1 ? "" : "s"} that mentioned the code.`;
    } catch {
      // The code is attached either way, which is the durable half. Say what
      // did not happen rather than rolling back something that was right.
      imported =
        " The code is attached, but re-importing those games failed. Run `npm run stats:sync` or paste the round.";
    }
  }

  revalidatePath("/players/mapping");
  revalidatePath("/players");

  return {
    error: null,
    playerId,
    done: `${player.name} now carries person code ${personCode}.${imported}`,
  };
}

async function appendToBatchLog(
  pb: Awaited<ReturnType<typeof getSuperuserClient>>,
  batchId: string,
  line: string,
): Promise<void> {
  try {
    const batch = await pb
      .collection("roster_imports")
      .getOne<BatchRecord>(batchId, { requestKey: null });
    await pb.collection("roster_imports").update(
      batchId,
      { log: `${batch.log ?? ""}\n${line}`.slice(-20000) },
      { requestKey: null },
    );
  } catch {
    // The decision is in `players`, which is what matters. A log line that did
    // not land must never fail the mapping it describes — the same rule
    // `announce()` follows for a pick.
  }
}
