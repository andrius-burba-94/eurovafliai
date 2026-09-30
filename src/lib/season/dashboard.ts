/**
 * The season dashboard's arithmetic, kept pure.
 *
 * The dashboard reads existing surfaces at once — standings, chat and the
 * league's news — and every one of those already has a query written for it.
 * What did *not* exist is the shaping between them: a standings row that
 * carries its movement since last round, and a season code said out loud.
 *
 * It lives here rather than in the component for the usual reason in this repo:
 * this is the half with answers that can be wrong. A panel that renders is easy
 * to see; a round delta computed against the wrong snapshot is not.
 *
 * Nothing here formats a number. Tenths become a decimal in exactly one place
 * in this app — `formatTenths` / `formatSignedTenths` in `stats/scoring.ts` —
 * and the first draft of this module had its own copy of both, which is how a
 * second rounding rule gets into a codebase.
 */

/** One member's line in the table, as the dashboard draws it. */
export type DashboardStanding = {
  readonly memberId: string;
  readonly teamName: string;
  readonly position: number;
  readonly totalHundredths: number;
  /**
   * Movement since the previous counted round, in tenths, or null when there is
   * no previous round to compare against.
   *
   * Null rather than zero on the first counted round. Zero means "played and
   * scored nothing", which is a real and different fact, and a table that drew
   * them the same way would tell every league its opening round was a blank.
   */
  readonly roundHundredths: number | null;
  readonly isYou: boolean;
};

/**
 * The standings table, ranked, with each row's movement since last round.
 *
 * Ranked on the **total**, which is what the league is playing for, and the
 * ranking is stable on team name so two members level on points do not swap
 * places between two renders of the same table.
 */
export function dashboardStandings({
  totals,
  previous,
  teamNames,
  youMemberId,
}: {
  /** This round's cumulative tenths per member. */
  totals: Readonly<Record<string, number>>;
  /** The previous counted round's cumulative tenths, or null if this is the first. */
  previous: Readonly<Record<string, number>> | null;
  teamNames: Readonly<Record<string, string>>;
  youMemberId: string | null;
}): DashboardStanding[] {
  const rows = Object.entries(totals).map(([memberId, totalHundredths]) => ({
    memberId,
    teamName: teamNames[memberId] ?? "Unnamed team",
    totalHundredths,
    // A member absent from the previous snapshot is *new to the table*, not a
    // member who scored nothing: joining mid-season would otherwise print a
    // delta equal to their whole total.
    roundHundredths:
      previous && memberId in previous
        ? totalHundredths - previous[memberId]!
        : null,
    isYou: memberId === youMemberId,
  }));

  rows.sort(
    (a, b) =>
      b.totalHundredths - a.totalHundredths || a.teamName.localeCompare(b.teamName),
  );

  return rows.map((row, index) => ({ ...row, position: index + 1 }));
}

/**
 * A season code as the league says it out loud: `"E2026"` → `"26-27"`.
 *
 * A Euroleague season spans two calendar years and is named for both, which is
 * why the code alone cannot be printed: `E2026` shown as "2026" is a year, and
 * the competition being played is 2026–27. The first version of this stripped
 * the century with a regex and produced `"26"` — a label that is not wrong so
 * much as it is half a name, and it went unnoticed until a render was looked
 * at.
 *
 * The second pair wraps with the century, so a 2099 season reads `99-00`
 * rather than `99-100`.
 */
export function seasonLabel(season: string): string {
  const match = /(\d{4})/.exec(season);
  if (!match) return season;
  const start = Number(match[1]);
  const first = String(start % 100).padStart(2, "0");
  const second = String((start + 1) % 100).padStart(2, "0");
  return `${first}-${second}`;
}
