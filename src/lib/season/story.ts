import type { Recap, RecapRow } from "@/lib/stats/recap";
import type { RoundSnapshot } from "@/lib/stats/standings";

/**
 * A round told as the league would tell it: who won the night and by how
 * much, who took the wooden spoon, and where the viewer moved. Pure — the
 * recap and the snapshots are read elsewhere.
 */

export type RoundStory = {
  readonly round: number;
  readonly winner: RecapRow;
  /** Hundredths between the winner and second place; null with one team. */
  readonly margin: number | null;
  /** Last place on the night; null when the round has one team. */
  readonly spoon: RecapRow | null;
};

export function roundStory(recap: Recap | null): RoundStory | null {
  if (!recap || recap.rows.length === 0) return null;
  const rows = recap.rows;
  const winner = rows[0]!;
  // A night nobody scored is not a win. Before any box score lands, the
  // recap still ranks the table, all at zero.
  if (winner.hundredths <= 0) return null;
  return {
    round: recap.round,
    winner,
    margin: rows.length > 1 ? winner.hundredths - rows[1]!.hundredths : null,
    spoon: rows.length > 1 ? rows[rows.length - 1]! : null,
  };
}

export type Movement = {
  readonly rank: number;
  readonly previousRank: number | null;
  /** Places gained since the previous counted round; negative is a drop. */
  readonly moved: number;
  /** Members the viewer was behind last round and is ahead of now. */
  readonly passed: readonly string[];
  /** Hundredths behind the leader; 0 when leading. */
  readonly gap: number;
  readonly totalHundredths: number;
};

function ranking(snapshot: RoundSnapshot, names: Readonly<Record<string, string>>): string[] {
  return [...snapshot.table]
    .sort(
      (a, b) =>
        b.totalHundredths - a.totalHundredths ||
        (names[a.memberId] ?? a.memberId).localeCompare(names[b.memberId] ?? b.memberId),
    )
    .map((row) => row.memberId);
}

/**
 * Where a member stands after the latest counted round and how that changed.
 * Ties break on team name, the same rule the table uses, so the hero and the
 * table cannot disagree about a rank.
 */
export function movementOf(
  snapshots: readonly RoundSnapshot[],
  memberId: string,
  teamNames: Readonly<Record<string, string>>,
): Movement | null {
  const latest = snapshots.at(-1);
  if (!latest) return null;
  const now = ranking(latest, teamNames);
  const index = now.indexOf(memberId);
  if (index === -1) return null;

  const previous = snapshots.at(-2);
  const before = previous ? ranking(previous, teamNames) : null;
  const previousIndex = before ? before.indexOf(memberId) : -1;
  const passed =
    before && previousIndex !== -1
      ? now.slice(index + 1).filter((other) => {
          const was = before.indexOf(other);
          return was !== -1 && was < previousIndex;
        })
      : [];

  const totals = new Map(latest.table.map((row) => [row.memberId, row.totalHundredths]));
  const total = totals.get(memberId) ?? 0;
  return {
    rank: index + 1,
    previousRank: previousIndex === -1 ? null : previousIndex + 1,
    moved: previousIndex === -1 ? 0 : previousIndex - index,
    passed,
    gap: (totals.get(now[0]!) ?? total) - total,
    totalHundredths: total,
  };
}

/** "1st", "2nd", "3rd", "11th", "22nd". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const unit = n % 10;
  return `${n}${unit === 1 ? "st" : unit === 2 ? "nd" : unit === 3 ? "rd" : "th"}`;
}
