/**
 * Reading a league's draft for export — the request-facing half of this slice.
 *
 * `tables.ts` decides what an export *contains* and is pure; this module does
 * the session, the permission and the reads, exactly the way `actions.ts` and
 * `pipeline.ts` are split elsewhere in the repo.
 *
 * It reads through `getDraftView`, which is the room's own query, rather than
 * fetching picks again here. That costs an extra read or two the export does
 * not strictly need (the chat, the radar) and buys the thing that matters: the
 * export and the board resolve a team's name, a player's club and who holds
 * whom through **one** code path, so a name can never read one way on the board
 * and another in the file somebody keeps.
 */
import { getSession } from "@/lib/auth/session";
import { getDraftView } from "@/lib/drafts/queries";
import { getLeagueWithMembers } from "@/lib/leagues/queries";

import {
  orderTable,
  poolTable,
  resultsTable,
  rostersTable,
  type ExportKind,
  type ExportTable,
} from "./tables";

export type DraftExport = {
  leagueName: string;
  /** Null when the league has members but nobody has rolled an order yet. */
  tables: ExportTable[];
};

/**
 * Why an export could not be produced — distinct cases, because they are
 * three different sentences on the page and three different status codes on
 * the route.
 */
export type ExportRefusal = "unauthorized" | "not-found" | "no-draft";

export type ExportResult =
  | { ok: true; value: DraftExport }
  | { ok: false; reason: ExportRefusal };

/**
 * The requested tables for a league, or why not.
 *
 * `not-found` covers both "no such league" and "not your league", the same way
 * the lobby does: telling them apart would let anyone probe which leagues
 * exist.
 */
export async function readDraftExport(
  leagueId: string,
  kinds: readonly ExportKind[],
): Promise<ExportResult> {
  const session = await getSession();
  if (!session) return { ok: false, reason: "unauthorized" };

  const league = await getLeagueWithMembers(leagueId);
  if (!league) return { ok: false, reason: "not-found" };
  if (!league.members.some((member) => member.isYou)) {
    return { ok: false, reason: "not-found" };
  }

  const view = await getDraftView(leagueId);
  if (!view) return { ok: false, reason: "no-draft" };

  const nameOf = new Map(view.members.map((member) => [member.id, member.name]));
  const seats = view.draft.order.map((memberId) => ({
    memberId,
    memberName: nameOf.get(memberId) ?? "Unknown member",
  }));
  const teamNames = Object.fromEntries(nameOf);

  const build: Record<ExportKind, () => ExportTable> = {
    results: () => resultsTable(view.picks),
    rosters: () => rostersTable(view.picks, seats),
    order: () => orderTable(seats),
    pool: () => poolTable(view.pool, teamNames),
  };

  return {
    ok: true,
    value: {
      leagueName: league.league.name,
      tables: kinds.map((kind) => build[kind]()),
    },
  };
}

/**
 * Does this league have a draft to export at all?
 *
 * The page asks before it offers the form, so a league still in the lobby says
 * so instead of handing out a button that returns an error. Cheap: the same
 * query the export itself runs, and Next memoises it within the render pass.
 */
export async function hasDraft(leagueId: string): Promise<boolean> {
  return (await getDraftView(leagueId)) !== null;
}
