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
  readonly from_round: number;
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
      from_round: 1,
      acquired_via: "draft",
    });
  }
  return rows;
}

export function isActiveMembership(toDate: unknown): boolean {
  return toDate === undefined || toDate === null || toDate === "";
}

/**
 * Does this window own a Euroleague round?
 *
 * Inclusive `from_round`, exclusive `to_round`. 0 / unset `to_round` means
 * still open — unless the calendar `to_date` is already closed without a
 * round, which is a fixture or a crash: that window covers no rounds rather
 * than all of them.
 */
export function coversRound(
  window: {
    readonly from_round?: number | null;
    readonly to_round?: number | null;
    readonly to_date?: string | null;
  },
  round: number,
): boolean {
  const from = window.from_round && window.from_round > 0 ? window.from_round : 1;
  if (round < from) return false;
  const to = window.to_round && window.to_round > 0 ? window.to_round : 0;
  if (to === 0) {
    return isActiveMembership(window.to_date);
  }
  return round < to;
}
