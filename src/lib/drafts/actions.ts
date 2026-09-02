"use server";

import { revalidatePath } from "next/cache";

import { requireSession } from "@/lib/auth/session";
import {
  computeRollback,
  isLegalPick,
  whoIsOnClock,
  type Position,
} from "@/lib/engine";
import { isManager } from "@/lib/leagues/lobby";
import { parseLeagueSettings, rosterSize } from "@/lib/leagues/settings";
import type { LeagueRecord, MemberRecord } from "@/lib/leagues/types";
import { getSuperuserClient } from "@/lib/pb/superuser";

import {
  commitPick,
  deadlineFrom,
  findUnfinishedDraft,
  isUniqueViolation,
  readPicks,
  repairUnadvanced,
  rosterPositionsOf,
  toState,
} from "./pipeline";
import type { DraftRecord } from "./types";

/**
 * The draft's server actions — the request-facing half of the pick pipeline.
 *
 * Every rule the draft-engine invariants insist on is enforced here, and
 * nowhere in a browser: whose turn it is, whether a pick is legal, and when the
 * draft is over are all decided server-side and re-decided on every request,
 * even when the UI already disabled the button.
 *
 * Three layers, deliberately separate:
 *
 * - the **engine** (`@/lib/engine`) decides — pure, and knows nothing of either
 *   caller;
 * - this module authorises and repaints — session, permissions, `revalidatePath`;
 * - `./pipeline` reads and writes — framework-free, and shared verbatim with the
 *   PM2 worker's sweep.
 *
 * That last line is the load-bearing one. Slice 2.5 gave the worker autodraft,
 * and it lands its picks through the *same* `commitPick` a tapped button does,
 * so a human pick and an automatic one cannot diverge.
 */

export type DraftResult = { error: string | null };
const OK: DraftResult = { error: null };

/** Everything a draft action needs, read before anything is written. */
async function loadDraftContext(leagueId: string) {
  const session = await requireSession();
  const pb = await getSuperuserClient();

  let league: LeagueRecord;
  try {
    league = await pb
      .collection("leagues")
      .getOne<LeagueRecord>(leagueId, { requestKey: null });
  } catch {
    return null;
  }

  const members = await pb
    .collection("league_members")
    .getFullList<MemberRecord>({
      filter: `league = '${leagueId}'`,
      sort: "draft_position",
      requestKey: null,
    });

  const own = members.find((member) => member.user === session.user.id);
  const actorIsCommissioner = league.commissioner === session.user.id;
  // Commissioning without a membership row is possible for a moment after
  // creation, so being the commissioner counts on its own.
  if (!own && !actorIsCommissioner) return null;

  return {
    pb,
    session,
    league,
    members,
    own,
    settings: parseLeagueSettings(league.settings),
    canManage: isManager({
      actorUserId: session.user.id,
      targetUserId: session.user.id,
      actorIsCommissioner,
      actorCanManage: Boolean(own?.can_manage),
      leagueStatus: league.status,
    }),
  };
}

/**
 * Start the draft.
 *
 * Freezes the order onto the draft record rather than pointing at
 * `league_members.draft_position`: those rows keep changing, and a draft that
 * silently re-ordered itself halfway through would be unrecoverable.
 *
 * ## Failure-recovery story
 *
 * Two writes: create the draft, then move the league to `drafting`. The order
 * is deliberate — a crash between them leaves a live draft whose league still
 * says `setup`, which is visible, harmless, and repaired by running this again
 * (it finds the existing draft and only fixes the league). The reverse order
 * would leave a league claiming to draft with no draft to open.
 *
 * The partial unique index on `drafts(league) WHERE status != 'complete'` is the
 * physical backstop: a double-click cannot produce two live drafts.
 */
export async function startDraft(
  _previous: DraftResult,
  formData: FormData,
): Promise<DraftResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const context = await loadDraftContext(leagueId);
  if (!context) return { error: "That is not yours to start." };

  const { pb, league, members, settings, canManage } = context;
  if (!canManage) {
    return {
      error:
        "Only the commissioner, or someone they trust with it, can start the draft.",
    };
  }

  // Every sibling control in draft-setup.ts guards on the lifecycle, and this
  // one has to as well: without it a replayed submission against a finished
  // league creates a SECOND draft, and `getDraftView` reads the newest — so
  // the completed board, every roster in the league, disappears from the room.
  if (league.status !== "setup" && league.status !== "drafting") {
    return {
      error:
        "This league has already drafted. Undo back into the draft if you need to change it.",
    };
  }

  const existing = await findUnfinishedDraft(pb, leagueId);

  if (!existing) {
    if (members.length < 2) {
      return { error: "A draft needs at least two members." };
    }
    const unpositioned = members.filter((member) => !member.draft_position);
    if (unpositioned.length > 0) {
      return {
        error: `Roll or set the draft order first — ${unpositioned.length} member(s) have no slot.`,
      };
    }

    const order = [...members]
      .sort((a, b) => (a.draft_position ?? 0) - (b.draft_position ?? 0))
      .map((member) => member.id);

    try {
      await pb.collection("drafts").create(
        {
          league: leagueId,
          format: settings.format,
          status: "live",
          order,
          rounds: rosterSize(settings.roster_template),
          current_pick: 1,
          pick_seconds: settings.pick_seconds,
          seed: settings.roll_seed,
          deadline: deadlineFrom(new Date(), settings.pick_seconds),
        },
        { requestKey: null },
      );
    } catch (error) {
      // The index refused it: somebody else started it a moment ago. That is
      // the outcome we wanted anyway, so fall through to fixing the league.
      if (!isUniqueViolation(error)) throw error;
    }
  }

  if (league.status !== "drafting") {
    await pb
      .collection("leagues")
      .update(leagueId, { status: "drafting" }, { requestKey: null });
  }

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/draft`);
  return OK;
}

/**
 * Make a pick.
 *
 * ## Failure-recovery story
 *
 * Two writes, and the order is fixed by ADR-0003: **create the pick first,
 * advance the draft second.** A crash between them leaves "a pick exists for
 * `current_pick` but the draft has not advanced past it" — an unambiguous,
 * detectable state that this function repairs on sight before doing anything
 * else, and that the worker's sweep repairs too. The reverse order would move
 * the draft on with a missing pick and no invariant to reveal it.
 *
 * Both unique indexes sit under the validation. A race that slips past
 * "is it your turn" is refused by `unique(draft, overall_no)`; one that slips
 * past "is that player taken" is refused by `unique(draft, player)`.
 */
export async function makePick(
  _previous: DraftResult,
  formData: FormData,
): Promise<DraftResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const playerId = String(formData.get("playerId") ?? "");
  const context = await loadDraftContext(leagueId);
  if (!context) return { error: "That is not yours to pick in." };

  /**
   * Every refusal repaints the room, not just the successful pick.
   *
   * A pick is refused precisely when the caller's screen has stopped matching
   * the draft — someone else took that player, the turn moved on, the
   * commissioner paused. Returning the message without revalidating leaves
   * them reading the stale page that produced the mistake, and inviting them
   * to make it again.
   */
  const refuse = (message: string): DraftResult => {
    revalidatePath(`/leagues/${leagueId}/draft`);
    return { error: message };
  };

  const { pb, own, settings, canManage } = context;

  const draft = await findUnfinishedDraft(pb, leagueId);
  if (!draft) return refuse("There is no draft running.");
  if (draft.status !== "live") {
    return refuse("The draft is paused.");
  }

  // One `now` for the whole action. A repair and the pick that follows it both
  // stamp a new deadline, and two timestamps a round trip apart would give the
  // next member a clock a fraction shorter than the one before it.
  const now = new Date();
  const picks = await readPicks(pb, draft.id);

  // Repair a pick that landed without the draft advancing past it. The repair
  // writes only to `drafts`, so the picks in hand are still current — and
  // re-reading them would be the read → repair → read-again shape AGENTS.md
  // records as broken, since Next memoizes identical GET fetches within a
  // render pass and the second read returns the first one's result.
  const repaired = await repairUnadvanced(pb, draft, picks, now);
  if (repaired) Object.assign(draft, repaired);

  const state = toState(draft);
  const onClock = whoIsOnClock(state, picks);
  if (!onClock) return refuse("The draft is finished.");

  // Server-authoritative, always re-checked: the UI having hidden the button is
  // not evidence of anything.
  const isTheirs = own?.id === onClock.memberId;
  if (!isTheirs && !canManage) {
    return refuse("It is not your turn.");
  }

  const player = await pb
    .collection("players")
    .getOne<{ id: string; position: Position; name: string; status: string }>(
      playerId,
      { requestKey: null },
    )
    .catch(() => null);
  if (!player) return refuse("No such player.");
  // The pool hides players the roster sync has marked as gone, and the server
  // has to agree with it. Otherwise a tab rendered before a mid-draft sync can
  // still draft one, filling a roster slot with somebody who will never appear
  // in a Euroleague box score again.
  if (player.status === "left") {
    return refuse(`${player.name} has left the Euroleague.`);
  }

  const rosterPositions = await rosterPositionsOf(pb, picks, onClock.memberId);
  const verdict = isLegalPick({
    player: { id: player.id, position: player.position },
    roster: rosterPositions,
    template: settings.roster_template,
    takenPlayerIds: new Set(picks.map((pick) => pick.playerId)),
  });
  if (!verdict.ok) return refuse(verdict.reason);

  // Both writes, in the fixed order, through the same pipeline the worker's
  // autodraft uses — so a human pick and an automatic one cannot diverge.
  const outcome = await commitPick(pb, {
    draft,
    onClock,
    playerId: player.id,
    isAuto: false,
    picks,
    now,
  });
  if (outcome === "raced") {
    // An index caught a race. Whoever won, this caller's pick did not land.
    return refuse("Gone — that slot or that player was taken a moment ago.");
  }

  revalidatePath(`/leagues/${leagueId}/draft`);
  return OK;
}

/** Pause or resume. A single write, and refused once the draft is complete. */
export async function setDraftPaused(
  _previous: DraftResult,
  formData: FormData,
): Promise<DraftResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const context = await loadDraftContext(leagueId);
  if (!context) return { error: "That is not yours to pause." };
  if (!context.canManage) {
    return {
      error:
        "Only the commissioner, or someone they trust with it, can pause the draft.",
    };
  }

  const { pb } = context;
  const draft = await findUnfinishedDraft(pb, leagueId);
  if (!draft) return { error: "There is no draft running." };

  const pause = String(formData.get("paused")) === "true";
  await pb.collection("drafts").update(
    draft.id,
    {
      status: pause ? "paused" : "live",
      // Resuming restarts the clock rather than honouring a deadline that
      // expired while everyone was at the bar.
      deadline: pause
        ? draft.deadline
        : deadlineFrom(new Date(), draft.pick_seconds),
    },
    { requestKey: null },
  );

  revalidatePath(`/leagues/${leagueId}/draft`);
  return OK;
}

/**
 * Undo, back to a chosen pick number.
 *
 * Somebody entered the wrong player, or entered a pick for the wrong member,
 * and the draft has moved on. This puts it back: every pick from the target
 * number onwards is discarded, the draft re-points at the target, and it lands
 * **paused** rather than live — an undo that immediately restarted a clock
 * would push the room straight back into the mistake.
 *
 * The engine decides what to discard, including the snake-direction maths for
 * who ends up on the clock. This function only reads and writes.
 *
 * No transactions, so the order is chosen to be safe if it stops halfway:
 *
 * 1. **Pause first.** Deleting picks out from under a live draft is a race:
 *    another member — or 2.5's autodraft — can read `live` and `current_pick`
 *    mid-loop and write a pick *above* the target. That pick survives the
 *    delete loop, and the re-point then leaves the board with a permanent gap
 *    that `isDraftComplete` will never fill, so the draft can never finish.
 * 2. Delete the picks, **highest overall number first**. A stop mid-way leaves
 *    a shorter but still contiguous board — never a hole with picks after it.
 * 3. Re-point the draft last. Until that write lands the draft still points
 *    past the deleted picks, and `whoIsOnClock` skips forward from
 *    `current_pick` to the first unpicked slot, so the room stays coherent.
 *
 * Step 3 is also why "nothing to delete" is not automatically an error: a run
 * that died between 2 and 3 leaves exactly that state, and refusing it would
 * make the repair unreachable. It is an error only when the draft is already
 * pointing at or before the target — then there really is nothing to undo.
 */
export async function rollbackDraft(
  _previous: DraftResult,
  formData: FormData,
): Promise<DraftResult> {
  const leagueId = String(formData.get("leagueId") ?? "");
  const context = await loadDraftContext(leagueId);
  if (!context) return { error: "That is not yours to undo." };
  if (!context.canManage) {
    return {
      error:
        "Only the commissioner, or someone they trust with it, can undo a pick.",
    };
  }

  const { pb } = context;
  const drafts = await pb.collection("drafts").getFullList<DraftRecord>({
    filter: `league = '${leagueId}'`,
    sort: "-created",
    requestKey: null,
  });
  const draft = drafts[0];
  if (!draft) return { error: "There is no draft to undo." };

  const raw = String(formData.get("targetPickNo") ?? "").trim();
  const targetPickNo = Number(raw);
  if (!raw || Number.isNaN(targetPickNo)) {
    return { error: "Give the pick number to undo back to." };
  }

  const picks = await readPicks(pb, draft.id);
  const verdict = computeRollback(toState(draft), picks, targetPickNo);
  if (!verdict.ok) return { error: verdict.reason };

  const { deletePickIds, currentPick, status } = verdict.rollback;
  if (deletePickIds.length === 0 && draft.current_pick <= targetPickNo) {
    return { error: `Nothing has been picked at ${targetPickNo} or later.` };
  }

  // Pause before touching a pick, so nobody can write into the range being
  // undone while it is being undone.
  if (draft.status === "live") {
    await pb
      .collection("drafts")
      .update(
        draft.id,
        { status: "paused", deadline: "" },
        { requestKey: null },
      );
  }

  // Highest first: the engine already sorted them that way, and the order is
  // the whole failure-recovery story.
  for (const id of deletePickIds) {
    await pb.collection("picks").delete(id, { requestKey: null });
  }

  await pb.collection("drafts").update(
    draft.id,
    {
      current_pick: currentPick,
      status,
      // Paused, so no deadline. Resuming sets a fresh one.
      deadline: "",
    },
    { requestKey: null },
  );

  // A finished draft that gets undone is running again, and the league has to
  // come back with it — 3.6 formalises this, `advance` set it on the way out.
  if (draft.status === "complete") {
    await pb
      .collection("leagues")
      .update(draft.league, { status: "drafting" }, { requestKey: null })
      .catch(() => {});
  }

  revalidatePath(`/leagues/${leagueId}`);
  revalidatePath(`/leagues/${leagueId}/draft`);
  return OK;
}
