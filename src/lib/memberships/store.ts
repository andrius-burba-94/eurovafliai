import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";

import { announce } from "@/lib/chat/store";

import { fromPicks, isActiveMembership } from "./from";
import type { ApplyPlan } from "./plan";

/**
 * Writing roster memberships — the PocketBase half.
 *
 * Framework-free so the pick pipeline (worker + human last pick) and
 * `recomputeStandings` share it. A completed draft that lost the membership
 * loop is the same leftover either way.
 *
 * ## Failure-recovery story
 *
 * One create per pick, after `drafts.status = complete` and
 * `leagues.status = season`. A crash leaves a mix of present and missing
 * rows. The unique index on an *active* (league, player) refuses a double
 * write; a second pass skips any player who already has an open window, so
 * re-running is the repair. We never delete here — start-over has its own
 * `clearLeagueMemberships`, and a rematerialize that wiped closed windows
 * would undo a trade.
 */

type MembershipRef = {
  id: string;
  player: string;
  to_date?: string | null;
};

export type MaterializeReport = {
  readonly created: number;
  readonly skipped: number;
};

export function asPbDate(now: Date): string {
  return now.toISOString().replace("T", " ");
}

export async function listActiveMemberships<
  T extends { player: string; to_date?: string | null },
>(
  pb: PocketBase,
  leagueId: string,
  options?: { fields?: string; expand?: string },
): Promise<T[]> {
  const rows = await pb.collection("roster_memberships").getFullList<T>({
    filter: `league = '${leagueId}'`,
    ...(options?.fields ? { fields: options.fields } : {}),
    ...(options?.expand ? { expand: options.expand } : {}),
    requestKey: null,
  });
  return rows.filter((row) => isActiveMembership(row.to_date));
}

export async function materializeDraftMemberships(
  pb: PocketBase,
  draft: { id: string; league: string },
  picks: readonly { memberId: string; playerId: string }[],
  fromDate: Date,
): Promise<MaterializeReport> {
  const wanted = fromPicks(picks, draft.league, asPbDate(fromDate));
  const existing = await listActiveMemberships<MembershipRef>(pb, draft.league, {
    fields: "player,to_date",
  });
  const held = new Set(existing.map((row) => row.player));

  let created = 0;
  let skipped = 0;
  for (const row of wanted) {
    if (held.has(row.player)) {
      skipped += 1;
      continue;
    }
    try {
      await pb.collection("roster_memberships").create(
        { ...row, to_date: "", to_round: 0 },
        { requestKey: null },
      );
      held.add(row.player);
      created += 1;
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await listActiveMemberships<MembershipRef>(
        pb,
        draft.league,
        { fields: "player,to_date" },
      );
      if (!raced.some((membership) => membership.player === row.player)) {
        throw error;
      }
      held.add(row.player);
      skipped += 1;
    }
  }
  return { created, skipped };
}

export async function clearLeagueMemberships(
  pb: PocketBase,
  leagueId: string,
): Promise<number> {
  const rows = await pb.collection("roster_memberships").getFullList<{
    id: string;
  }>({
    filter: `league = '${leagueId}'`,
    fields: "id",
    requestKey: null,
  });
  for (const row of rows) {
    await pb.collection("roster_memberships").delete(row.id, {
      requestKey: null,
    });
  }
  return rows.length;
}

export type AppliedTransaction = {
  readonly id: string;
  readonly created: boolean;
};

type StoredTransaction = {
  id: string;
  type: string;
  from_round: number;
  members: unknown;
  players_in: unknown;
  players_out: unknown;
};

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalJson(item)).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>).sort(
      ([a], [b]) => a.localeCompare(b),
    );
    return `{${entries
      .map(([key, nested]) => `${JSON.stringify(key)}:${canonicalJson(nested)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function sameJson(left: unknown, right: unknown): boolean {
  return canonicalJson(left) === canonicalJson(right);
}

async function findMatchingTransaction(
  pb: PocketBase,
  leagueId: string,
  plan: ApplyPlan,
): Promise<StoredTransaction | undefined> {
  const rows = await pb.collection("transactions").getFullList<StoredTransaction>({
    filter: `league = '${leagueId}'`,
    requestKey: null,
  });
  return rows.find(
    (row) =>
      row.type === plan.type &&
      row.from_round === plan.fromRound &&
      sameJson(row.members, [...plan.members]) &&
      sameJson(row.players_in, plan.playersIn) &&
      sameJson(row.players_out, plan.playersOut),
  );
}

/**
 * Record a planned transaction, then close and open membership windows.
 *
 * Intent first: the `transactions` row is the repair key. A crash after that
 * write and before the membership loop is the same leftover as a retry — we
 * find the matching row and finish the closes/opens. Unique active
 * `(league, player)` refuses a double open; a second pass skips held players.
 * Announce last and never throws.
 */
export async function applyTransaction(
  pb: PocketBase,
  leagueId: string,
  plan: ApplyPlan,
  now: Date,
  announcement: string,
  note: string,
): Promise<AppliedTransaction> {
  const stamp = asPbDate(now);
  let stored = await findMatchingTransaction(pb, leagueId, plan);
  let created = false;
  if (!stored) {
    stored = await pb.collection("transactions").create<StoredTransaction>(
      {
        league: leagueId,
        type: plan.type,
        date: stamp,
        from_round: plan.fromRound,
        members: [...plan.members],
        players_in: plan.playersIn,
        players_out: plan.playersOut,
        note,
      },
      { requestKey: null },
    );
    created = true;
  }

  for (const step of plan.closes) {
    const row = await pb.collection("roster_memberships").getOne<{
      id: string;
      to_date?: string | null;
    }>(step.membershipId, { requestKey: null });
    if (!isActiveMembership(row.to_date)) continue;
    await pb.collection("roster_memberships").update(
      step.membershipId,
      { to_date: stamp, to_round: step.toRound },
      { requestKey: null },
    );
  }

  const held = new Set(
    (
      await listActiveMemberships<MembershipRef>(pb, leagueId, {
        fields: "player,to_date",
      })
    ).map((row) => row.player),
  );

  for (const step of plan.opens) {
    if (held.has(step.player)) continue;
    try {
      await pb.collection("roster_memberships").create(
        {
          league: leagueId,
          member: step.member,
          player: step.player,
          from_date: stamp,
          to_date: "",
          from_round: step.fromRound,
          to_round: 0,
          acquired_via: step.acquired_via,
        },
        { requestKey: null },
      );
      held.add(step.player);
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      const raced = await listActiveMemberships<MembershipRef>(pb, leagueId, {
        fields: "player,to_date",
      });
      if (!raced.some((membership) => membership.player === step.player)) {
        throw error;
      }
      held.add(step.player);
    }
  }

  await announce(pb, leagueId, announcement);
  return { id: stored.id, created };
}
