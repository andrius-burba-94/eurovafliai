/**
 * The rows a completed draft should write as roster memberships.
 *
 * Pure: the store decides what already exists and PocketBase is the backstop.
 * A pick that names the same player twice is collapsed — unique(draft, player)
 * already forbids that, and collapsing here means a corrupt board cannot
 * produce two creates that the unique index would then refuse as a race.
 */

export type DraftMembership = {
  readonly league: string;
  readonly member: string;
  readonly player: string;
  readonly from_date: string;
  readonly acquired_via: "draft";
};

export function fromPicks(
  picks: readonly { memberId: string; playerId: string }[],
  leagueId: string,
  fromDate: string,
): DraftMembership[] {
  const seen = new Set<string>();
  const rows: DraftMembership[] = [];
  for (const pick of picks) {
    if (seen.has(pick.playerId)) continue;
    seen.add(pick.playerId);
    rows.push({
      league: leagueId,
      member: pick.memberId,
      player: pick.playerId,
      from_date: fromDate,
      acquired_via: "draft",
    });
  }
  return rows;
}

export function isActiveMembership(toDate: unknown): boolean {
  return toDate === undefined || toDate === null || toDate === "";
}
