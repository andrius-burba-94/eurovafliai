"use server";

import { revalidatePath } from "next/cache";

import { rollOrder } from "@/lib/engine";
import { getSuperuserClient } from "@/lib/pb/superuser";

import { requireSession } from "@/lib/auth/session";

import {
  DRAFT_FORMATS,
  MAX_PICK_SECONDS,
  MIN_PICK_SECONDS,
  ORDER_MODES,
  parseLeagueSettings,
} from "./settings";
import type { LeagueRecord, MemberRecord } from "./types";

/**
 * Slice 2.3a — draft settings and order determination.
 *
 * The commissioner chooses the format and the clock, then fixes the order: a
 * seeded roll, or a hand-picked order agreed at the bar. Both write
 * `league_members.draft_position`, the field slice 1.1 created and left "unset
 * until the roll"; the engine's `buildPickOrder` takes members already in that
 * order, so this is the slice that decides it.
 *
 * No new collection: the settings live in `leagues.settings` and the positions
 * on the memberships. `drafts` and `picks` arrive with the pick pipeline in 2.4.
 *
 * Errors come back through `useActionState` rather than a query string, the way
 * the 1.3b lobby actions do — never a URL somebody could be handed (issue #16).
 */

export type SetupResult = { error: string | null };
const OK: SetupResult = { error: null };
const NOT_YOURS: SetupResult = {
  error: "Only the commissioner can change the draft setup.",
};

/**
 * Load the league and its members, and confirm the caller runs it.
 *
 * `leagueId` arrives in a form field, so it is attacker-controlled: the
 * commissioner check is what stops a crafted post rolling somebody else's
 * draft. The refusal is deliberately the same whether the league is missing or
 * simply not theirs.
 */
async function loadSetupContext(formData: FormData) {
  const session = await requireSession();
  const leagueId = String(formData.get("leagueId") ?? "");
  if (!leagueId) return null;

  const pb = await getSuperuserClient();

  let league: LeagueRecord;
  try {
    league = await pb
      .collection("leagues")
      .getOne<LeagueRecord>(leagueId, { requestKey: null });
  } catch {
    return null;
  }

  if (league.commissioner !== session.user.id) return null;

  const members = await pb
    .collection("league_members")
    .getFullList<MemberRecord>({
      filter: `league = '${leagueId}'`,
      // A stable read order, so a manual order submitted from the rendered list
      // means what the commissioner saw.
      sort: "created",
      requestKey: null,
    });

  return {
    pb,
    league,
    members,
    settings: parseLeagueSettings(league.settings),
  };
}

/** Format and clock. A single write, so there is no torn-write story to tell. */
export async function updateDraftSettings(
  _previous: SetupResult,
  formData: FormData,
): Promise<SetupResult> {
  const context = await loadSetupContext(formData);
  if (!context) return NOT_YOURS;

  const { pb, league, settings } = context;
  if (league.status !== "setup") {
    return { error: "The draft has already started." };
  }

  const format = String(formData.get("format") ?? "");
  const orderMode = String(formData.get("order_mode") ?? "");
  const pickSeconds = Number(formData.get("pick_seconds"));

  if (!DRAFT_FORMATS.includes(format as (typeof DRAFT_FORMATS)[number])) {
    return { error: "Pick one of the formats offered." };
  }
  if (!ORDER_MODES.includes(orderMode as (typeof ORDER_MODES)[number])) {
    return { error: "Pick one of the order modes offered." };
  }
  if (
    !Number.isInteger(pickSeconds) ||
    pickSeconds < MIN_PICK_SECONDS ||
    pickSeconds > MAX_PICK_SECONDS
  ) {
    return {
      error: `Give each pick between ${MIN_PICK_SECONDS} and ${MAX_PICK_SECONDS} seconds.`,
    };
  }

  await pb.collection("leagues").update(
    league.id,
    {
      settings: {
        ...settings,
        format,
        order_mode: orderMode,
        pick_seconds: pickSeconds,
      },
    },
    { requestKey: null },
  );

  revalidatePath(`/leagues/${league.id}`);
  return OK;
}

/**
 * Roll the order.
 *
 * ## Failure-recovery story
 *
 * This writes N+1 records — the seed on the league, then a `draft_position` on
 * every membership — and PocketBase has no transactions. The order is chosen so
 * the intermediate state is repairable rather than merely detectable:
 *
 * 1. **The seed is written first.** From that moment the order is a pure
 *    function of the stored seed and the member set, so a crash anywhere after
 *    it loses no information at all.
 * 2. **Positions are written second**, one membership at a time. A crash leaves
 *    some members positioned and some not.
 * 3. **Re-rolling is not the repair; re-applying is.** Running this again with
 *    a seed already stored recomputes the same order and writes the same
 *    numbers, so it is idempotent. A fresh seed is only generated when there
 *    isn't one, which is what stops a retry from silently changing who drafts
 *    first after somebody has already seen the result.
 *
 * The engine refuses a duplicate member id, and `unique(league, user)` makes
 * that impossible in the database anyway.
 */
/**
 * Write one position per member, in the given order.
 *
 * Shared by rolling and reshuffling because the write and its recovery are the
 * same: independent per-member updates, and the seed already stored means a
 * partial pass is repaired by running it again rather than by re-deciding
 * anything.
 */
async function writePositions(
  pb: Awaited<ReturnType<typeof getSuperuserClient>>,
  order: readonly string[],
): Promise<string[]> {
  const failures: string[] = [];
  for (const [index, memberId] of order.entries()) {
    try {
      await pb
        .collection("league_members")
        .update(memberId, { draft_position: index + 1 }, { requestKey: null });
    } catch {
      failures.push(memberId);
    }
  }
  return failures;
}

/**
 * Reshuffle: deliberately throw the order away and draw a new one.
 *
 * The counterpart to `rollDraftOrder`, and the reason that one never generates
 * a fresh seed on a retry. Re-applying must be safe to press twice; changing
 * who drafts first must not happen by accident. So the destructive version is a
 * separate action behind its own confirmation, and it refuses once the draft is
 * under way — at that point the order is not a plan any more, it is history.
 *
 * Same failure-recovery shape as the roll: the new seed is written first, so a
 * crash mid-way leaves an order that `Re-apply` reproduces exactly.
 */
export async function reshuffleDraftOrder(
  _previous: SetupResult,
  formData: FormData,
): Promise<SetupResult> {
  const context = await loadSetupContext(formData);
  if (!context) return NOT_YOURS;

  const { pb, league, members, settings } = context;
  if (league.status !== "setup") {
    return {
      error: "The draft has already started; the order is history now.",
    };
  }
  if (members.length < 2) {
    return { error: "Wait for at least one more member before reshuffling." };
  }
  if (String(formData.get("confirm")) !== "reshuffle") {
    return {
      error: "Tick the box to confirm — a reshuffle changes who picks first.",
    };
  }

  const seed = crypto.randomUUID();
  await pb
    .collection("leagues")
    .update(
      league.id,
      { settings: { ...settings, roll_seed: seed, order_mode: "roll" } },
      { requestKey: null },
    );

  const order = rollOrder(
    members.map((member) => member.id),
    seed,
  );
  const failures = await writePositions(pb, order);

  revalidatePath(`/leagues/${league.id}`);

  if (failures.length > 0) {
    return {
      error: `Reshuffled, but ${failures.length} of ${order.length} positions did not save. Press "Re-apply" — the new seed is stored, so it will finish the same order.`,
    };
  }
  return OK;
}

export async function rollDraftOrder(
  _previous: SetupResult,
  formData: FormData,
): Promise<SetupResult> {
  const context = await loadSetupContext(formData);
  if (!context) return NOT_YOURS;

  const { pb, league, members, settings } = context;
  if (league.status !== "setup") {
    return { error: "The draft has already started." };
  }
  if (settings.order_mode === "reverse_standings") {
    return {
      error:
        "Reverse standings needs last season's final table, which arrives with Phase 4. Roll or set the order by hand.",
    };
  }
  if (members.length < 2) {
    return { error: "Wait for at least one more member before rolling." };
  }

  // Generated here, never in the engine: the engine may not touch randomness,
  // which is what makes a roll replayable (see src/lib/engine/roll.ts).
  const seed = settings.roll_seed || crypto.randomUUID();

  if (!settings.roll_seed) {
    await pb
      .collection("leagues")
      .update(
        league.id,
        { settings: { ...settings, roll_seed: seed } },
        { requestKey: null },
      );
  }

  const order = rollOrder(
    members.map((member) => member.id),
    seed,
  );

  const failures = await writePositions(pb, order);

  revalidatePath(`/leagues/${league.id}`);

  if (failures.length > 0) {
    return {
      error: `Rolled, but ${failures.length} of ${order.length} positions did not save. Roll again — the seed is stored, so the order will be the same.`,
    };
  }
  return OK;
}

/**
 * Set the order by hand — the coin flips and side bets a league settled offline.
 *
 * Same write shape as the roll minus the seed, and the same repair: re-submit.
 * The submitted list must be exactly this league's members, so a crafted post
 * cannot position somebody from another league or leave a member out.
 */
export async function setManualOrder(
  _previous: SetupResult,
  formData: FormData,
): Promise<SetupResult> {
  const context = await loadSetupContext(formData);
  if (!context) return NOT_YOURS;

  const { pb, league, members, settings } = context;
  if (league.status !== "setup") {
    return { error: "The draft has already started." };
  }

  const submitted = formData
    .getAll("order")
    .map((value) => String(value))
    .filter(Boolean);

  const expected = new Set(members.map((member) => member.id));
  const seen = new Set(submitted);
  if (
    submitted.length !== members.length ||
    seen.size !== submitted.length ||
    submitted.some((id) => !expected.has(id))
  ) {
    return {
      error:
        "That order does not list this league's members exactly once each.",
    };
  }

  const failures: string[] = [];
  for (const [index, memberId] of submitted.entries()) {
    try {
      await pb
        .collection("league_members")
        .update(memberId, { draft_position: index + 1 }, { requestKey: null });
    } catch {
      failures.push(memberId);
    }
  }

  // A hand-set order is not a roll: clear the seed so the lobby cannot claim the
  // order came from one.
  if (settings.roll_seed) {
    await pb
      .collection("leagues")
      .update(
        league.id,
        { settings: { ...settings, roll_seed: "" } },
        { requestKey: null },
      );
  }

  revalidatePath(`/leagues/${league.id}`);

  if (failures.length > 0) {
    return {
      error: `${failures.length} of ${submitted.length} positions did not save. Submit the order again.`,
    };
  }
  return OK;
}
