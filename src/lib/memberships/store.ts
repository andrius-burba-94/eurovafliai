import type PocketBase from "pocketbase";

import { isUniqueViolation } from "@/lib/drafts/unique";

import { fromPicks, isActiveMembership } from "./from";

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
        { ...row, to_date: "" },
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
