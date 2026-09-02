import type PocketBase from "pocketbase";

import {
  findUnadvancedPick,
  isDraftComplete,
  type DraftState,
  type EnginePick,
  type OnClock,
  type Position,
} from "@/lib/engine";

import type { DraftRecord, PickRecord } from "./types";

/**
 * The pick pipeline — the reads and writes a pick is made of, and nothing else.
 *
 * Slice 2.4 built this inside the `makePick` server action. Slice 2.5 moved it
 * here for one reason: the PM2 worker autodrafts through the *same* pipeline
 * (invariant §3), and a worker cannot import a `"use server"` module — it would
 * drag in `next/cache` and `server-only` and throw on the first line. Two
 * copies of "create the pick, then advance the draft" would be two chances for
 * a human pick and an automatic one to diverge, which is the one difference
 * this app cannot afford.
 *
 * So this module is deliberately **framework-free**: no `server-only`, no
 * `next/*`, no session, no `revalidatePath`. It takes a PocketBase client and a
 * `now`, and it does as it is told. Deciding *whether* the pick may be made is
 * the caller's job — the server action checks the session and the turn, the
 * worker checks the clock — and both then land the pick the same way.
 *
 * `now` is a parameter rather than a `new Date()` for the same reason the
 * engine takes it as one: a pipeline that reaches for the wall clock cannot be
 * tested against a deadline.
 *
 * ## Failure recovery, in one place
 *
 * PocketBase has no transactions, so the two writes are ordered by ADR-0003:
 * **create the pick first, advance the draft second.** A crash between them
 * leaves "a pick exists for `current_pick` but the draft has not advanced past
 * it" — unambiguous, detectable, and repaired on sight by `repairUnadvanced`,
 * which both the action and the worker call before they read anything. The
 * reverse order would move the draft on with a missing pick and no invariant
 * left to reveal it.
 */

/** A `deadline` value in the shape PocketBase stores. */
export function deadlineFrom(now: Date, seconds: number): string {
  return new Date(now.getTime() + seconds * 1000)
    .toISOString()
    .replace("T", " ");
}

export function isUniqueViolation(error: unknown): boolean {
  const data = (
    error as {
      response?: { data?: Record<string, { code?: string } | undefined> };
    }
  )?.response?.data;
  if (!data) return false;
  // PocketBase's own code, confirmed against a live 0.39 instance: a duplicate
  // on the composite index comes back 400 with `validation_not_unique` on each
  // field of the index. Substring-matching a stringified error instead would
  // read an unrelated failure as "someone else already did it" and swallow it.
  return Object.values(data).some(
    (field) => field?.code === "validation_not_unique",
  );
}

/** The league's draft that is still running, or null. */
export async function findUnfinishedDraft(
  pb: PocketBase,
  leagueId: string,
): Promise<DraftRecord | null> {
  const drafts = await pb.collection("drafts").getFullList<DraftRecord>({
    filter: `league = '${leagueId}' && status != 'complete'`,
    requestKey: null,
  });
  return drafts[0] ?? null;
}

/** Every pick in the draft, in engine shape, ordered by overall number. */
export async function readPicks(
  pb: PocketBase,
  draftId: string,
): Promise<EnginePick[]> {
  const records = await pb.collection("picks").getFullList<PickRecord>({
    filter: `draft = '${draftId}'`,
    sort: "overall_no",
    requestKey: null,
  });
  return records.map((record) => ({
    id: record.id,
    overallNo: record.overall_no,
    memberId: record.member,
    playerId: record.player,
  }));
}

/** The positions a member has already drafted — what legality is checked against. */
export async function rosterPositionsOf(
  pb: PocketBase,
  picks: readonly EnginePick[],
  memberId: string,
): Promise<{ position: Position }[]> {
  const mine = picks.filter((pick) => pick.memberId === memberId);
  if (mine.length === 0) return [];
  const ids = mine.map((pick) => `id = '${pick.playerId}'`).join(" || ");
  const players = await pb
    .collection("players")
    .getFullList<{ position: Position }>({ filter: ids, requestKey: null });
  return players.map((player) => ({ position: player.position }));
}

/** The draft record in the shape the engine reads. */
export function toState(draft: DraftRecord): DraftState {
  return {
    format: draft.format,
    memberIds: draft.order,
    rounds: draft.rounds,
    currentPick: draft.current_pick,
    status: draft.status,
  };
}

/** Move the draft to the next slot, or finish it. */
export async function advance(
  pb: PocketBase,
  draft: DraftRecord,
  picks: readonly EnginePick[],
  /**
   * The slot that was just filled. Usually `current_pick`, but not always:
   * `whoIsOnClock` skips forward over slots that already hold a pick, so after
   * a repair the pick can land ahead of where the draft was pointing. Deriving
   * the next slot from `current_pick` in that case leaves it pointing at a
   * taken slot — self-healing, since the clock skips forward again, but the
   * worker's deadlines read this field and deserve it to be true.
   */
  filledNo: number,
  now: Date,
): Promise<void> {
  const next = Math.max(draft.current_pick, filledNo) + 1;
  const state = toState({ ...draft, current_pick: next });
  const done = isDraftComplete(state, picks);

  await pb.collection("drafts").update(
    draft.id,
    done
      ? { status: "complete", current_pick: next, deadline: "" }
      : {
          current_pick: next,
          deadline: deadlineFrom(now, draft.pick_seconds),
        },
    { requestKey: null },
  );

  if (done) {
    await pb
      .collection("leagues")
      .update(draft.league, { status: "season" }, { requestKey: null })
      .catch(() => {});
  }
}

/**
 * Finish an advance that never happened.
 *
 * The one intermediate state a pick can leave behind, and the reason the write
 * order is what it is. Idempotent: running it twice changes nothing, because
 * after the first run there is no unadvanced pick to find.
 *
 * Returns the fields it changed, so a caller holding the stale record can patch
 * it in hand. Re-reading the draft instead would be the read → repair →
 * read-again shape AGENTS.md records as broken — Next memoizes identical GET
 * fetches within a render pass, so the second read returns the first one's
 * result and the repair looks like it silently failed.
 */
export async function repairUnadvanced(
  pb: PocketBase,
  draft: DraftRecord,
  picks: readonly EnginePick[],
  now: Date,
): Promise<Partial<DraftRecord> | null> {
  // The engine owns this, and owns the part that is easy to get wrong: a
  // worker that autodrafted several times without advancing leaves a whole
  // contiguous run, not one pick, so the repair walks forward past all of it.
  const stranded = findUnadvancedPick(toState(draft), picks);
  if (!stranded) return null;
  await advance(pb, draft, picks, stranded.nextCurrentPick - 1, now);
  return { current_pick: stranded.nextCurrentPick };
}

export type CommitPickInput = {
  readonly draft: DraftRecord;
  /** Straight from `whoIsOnClock` — recomputing it here would be a second source of truth. */
  readonly onClock: OnClock;
  readonly playerId: string;
  /** True when the engine picked, not a person. */
  readonly isAuto: boolean;
  /** The picks as read before this one, used to decide whether the draft is now finished. */
  readonly picks: readonly EnginePick[];
  readonly now: Date;
};

/**
 * Create the pick, then advance the draft. In that order, always.
 *
 * `"raced"` means a unique index refused the pick: somebody — another member,
 * or this sweep a tick earlier — filled that slot or took that player first.
 * It is a normal outcome under concurrency, not a fault, and the caller decides
 * what to say about it. Every other failure throws, because a write that fails
 * for a reason we have not thought about must not be reported as a pick.
 */
export async function commitPick(
  pb: PocketBase,
  { draft, onClock, playerId, isAuto, picks, now }: CommitPickInput,
): Promise<"landed" | "raced"> {
  // Write 1: the pick.
  try {
    await pb.collection("picks").create(
      {
        draft: draft.id,
        overall_no: onClock.overallNo,
        round: onClock.round,
        slot: onClock.slot,
        member: onClock.memberId,
        player: playerId,
        is_auto: isAuto,
      },
      { requestKey: null },
    );
  } catch (error) {
    if (isUniqueViolation(error)) return "raced";
    throw error;
  }

  // Write 2: advance.
  await advance(
    pb,
    draft,
    [
      ...picks,
      {
        id: "pending",
        overallNo: onClock.overallNo,
        memberId: onClock.memberId,
        playerId,
      },
    ],
    onClock.overallNo,
    now,
  );

  return "landed";
}
