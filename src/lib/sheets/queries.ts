import "server-only";

import { getSession } from "@/lib/auth/session";
import { countByPosition, type Position } from "@/lib/engine";
import { parseLeagueSettings } from "@/lib/leagues/settings";
import { createUserClient } from "@/lib/pb/server";

import { sheetToText, tierOfRank } from "./ranking";
import { readMatchablePool, readSheet } from "./store";

/**
 * Reading your own cheat sheet.
 *
 * Through the **user's** token, like every other read in this app — which here
 * is more than a convention. The `cheat_sheets` read rule is
 * `member.user = @request.auth.id`, so PocketBase itself refuses another
 * member's sheet: the privacy PRODUCT.md promises is enforced twice, once by
 * this function only ever asking for the actor's own membership and once by the
 * database refusing to answer if it asked for anything else.
 */

export type SheetPlayerRow = {
  readonly rank: number;
  readonly tier: number;
  readonly id: string;
  readonly name: string;
  readonly club: string;
  readonly position: Position;
  /** True when the player is no longer in the draftable pool at all. */
  readonly missing: boolean;
};

export type CheatSheetView = {
  readonly leagueName: string;
  readonly memberId: string;
  readonly rows: SheetPlayerRow[];
  /** Break positions, as stored. */
  readonly tiers: number[];
  readonly source: "csv" | "manual";
  /** How many players the sheet could rank. Context for "you have ranked 20". */
  readonly poolSize: number;
  /** The league is drafting right now — the sheet is editable during it too. */
  readonly drafting: boolean;
  /**
   * The sheet written back out as `rank,tier,name`, ready to be edited.
   *
   * The whole reason the paste box is an *edit* box. Without it the only way to
   * change a ranking was to compose a new one somewhere else, and "this
   * replaces the sheet you have now, whole" was a one-way door with no copy of
   * what went through it. Rendered from the stored ranking rather than from
   * whatever text was last pasted, because the stored ranking is the truth and
   * the paste may have been months ago.
   */
  readonly asText: string;
  /**
   * How many of each position the sheet ranks, against the league's template.
   *
   * A sheet of fourteen forwards is a broken sheet — autodraft walks it, finds
   * nothing legal after the fifth, and falls through to the lowest player id
   * for the rest of the draft. Nothing on this surface could say so: it counted
   * "14 of 323 ranked" and stopped. The radar answers this question about
   * rosters; the sheet has to answer it about itself.
   */
  readonly cover: Record<Position, { ranked: number; needed: number }>;
};

export async function getCheatSheetView(
  leagueId: string,
): Promise<CheatSheetView | null> {
  const session = await getSession();
  if (!session) return null;

  const pb = createUserClient(session.token);

  let league: { name: string; status: string; settings: unknown };
  try {
    league = await pb
      .collection("leagues")
      .getOne<{ name: string; status: string; settings: unknown }>(leagueId, {
        requestKey: null,
      });
  } catch {
    return null;
  }
  const leagueSettings = league.settings;

  const members = await pb
    .collection("league_members")
    .getFullList<{ id: string }>({
      filter: `league = '${leagueId}' && user = '${session.user.id}'`,
      requestKey: null,
    });
  const own = members[0];
  if (!own) return null;

  const [sheet, pool] = await Promise.all([
    readSheet(pb, own.id),
    readMatchablePool(pb),
  ]);

  const byId = new Map(pool.map((player) => [player.id, player]));
  const tiers = sheet?.tiers ?? [];

  const rows: SheetPlayerRow[] = (sheet?.ranking ?? []).map((id, index) => {
    const rank = index + 1;
    const player = byId.get(id);
    return {
      rank,
      tier: tierOfRank(rank, tiers),
      id,
      // A ranked player can leave the Euroleague between writing the sheet and
      // drafting from it. Shown, greyed and counted rather than dropped: a
      // silently shorter sheet is a sheet whose owner does not know it moved.
      name: player?.name ?? "No longer in the pool",
      club: player?.club ?? "",
      position: player?.position ?? "G",
      missing: player === undefined,
    };
  });

  const counts = countByPosition(
    rows
      .filter((row) => !row.missing)
      .map((row) => ({ position: row.position })),
  );
  const template = parseLeagueSettings(leagueSettings).roster_template;

  return {
    leagueName: league.name,
    memberId: own.id,
    rows,
    tiers,
    source: sheet?.source ?? "csv",
    poolSize: pool.length,
    drafting: league.status === "drafting",
    asText: sheetToText(rows),
    cover: {
      G: { ranked: counts.G, needed: template.G },
      F: { ranked: counts.F, needed: template.F },
      C: { ranked: counts.C, needed: template.C },
    },
  };
}
