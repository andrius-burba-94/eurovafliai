import type { RoundSnapshot } from "@/lib/stats/standings";

/**
 * The league's running honours, read from the per-round snapshots: who won
 * each night, who took each wooden spoon, and who is on a streak. Pure and
 * deterministic — a badge is a fact about stored rounds, never a judgement,
 * so the same table always earns the same badges.
 */

export type RoundHonours = {
  readonly round: number;
  /** Members with the night's highest round score (all of them on a tie). */
  readonly winners: readonly string[];
  /** Members with the night's lowest round score; empty for a one-team night. */
  readonly spoons: readonly string[];
};

export type MemberHonours = {
  readonly memberId: string;
  readonly roundsWon: number;
  readonly spoons: number;
  /** Consecutive counted rounds, ending with the latest, in the night's top three. */
  readonly topThreeStreak: number;
  readonly bestRoundHundredths: number;
};

export type BadgeId = "on-fire" | "crowned" | "spoon-collector";

/** What each honour means, in the words of the thresholds `badgesFrom` applies. */
export const HONOUR_MEANING: Readonly<Record<BadgeId, string>> = {
  "on-fire": "Top three in three or more rounds in a row.",
  crowned: "Won a round.",
  "spoon-collector": "Finished last in two or more rounds.",
};

export type Badge = {
  readonly id: BadgeId;
  readonly memberId: string;
  readonly title: string;
  readonly detail: string;
  /** The number behind it: rounds running, rounds won, spoons. */
  readonly tally: number;
};

/** A night nobody scored crowns nobody: every row at zero is not a round. */
export function honoursByRound(snapshots: readonly RoundSnapshot[]): RoundHonours[] {
  return snapshots.map((snapshot) => {
    const scores = snapshot.table.map((row) => row.roundHundredths);
    const top = Math.max(...scores, 0);
    if (top <= 0 || snapshot.table.length === 0) return { round: snapshot.round, winners: [], spoons: [] };
    const bottom = Math.min(...scores);
    return {
      round: snapshot.round,
      winners: snapshot.table.filter((row) => row.roundHundredths === top).map((row) => row.memberId),
      spoons:
        snapshot.table.length > 1 && bottom < top
          ? snapshot.table.filter((row) => row.roundHundredths === bottom).map((row) => row.memberId)
          : [],
    };
  });
}

/** Where a member finished on one night: 1 + the number who outscored them. */
function nightPlace(snapshot: RoundSnapshot, memberId: string): number | null {
  const mine = snapshot.table.find((row) => row.memberId === memberId);
  if (!mine) return null;
  return 1 + snapshot.table.filter((row) => row.roundHundredths > mine.roundHundredths).length;
}

export function memberHonours(snapshots: readonly RoundSnapshot[]): MemberHonours[] {
  const honours = honoursByRound(snapshots);
  const members = [...new Set(snapshots.flatMap((snapshot) => snapshot.table.map((row) => row.memberId)))];
  return members.map((memberId) => {
    let streak = 0;
    for (let index = snapshots.length - 1; index >= 0; index -= 1) {
      const place = nightPlace(snapshots[index]!, memberId);
      if (place === null || place > 3 || honours[index]!.winners.length === 0) break;
      streak += 1;
    }
    return {
      memberId,
      roundsWon: honours.filter((round) => round.winners.includes(memberId)).length,
      spoons: honours.filter((round) => round.spoons.includes(memberId)).length,
      topThreeStreak: streak,
      bestRoundHundredths: Math.max(
        0,
        ...snapshots.flatMap((snapshot) =>
          snapshot.table.filter((row) => row.memberId === memberId).map((row) => row.roundHundredths),
        ),
      ),
    };
  });
}

/**
 * The badges on show. Thresholds are the league's own words: three straight
 * top-three nights is "on fire", a won night is a crown, two spoons is a
 * collection. Ordered so the most flattering reads first.
 */
export function badgesFrom(snapshots: readonly RoundSnapshot[]): Badge[] {
  const badges: Badge[] = [];
  const all = memberHonours(snapshots);
  for (const member of all) {
    if (member.topThreeStreak >= 3) {
      badges.push({
        id: "on-fire",
        memberId: member.memberId,
        title: "On fire",
        detail: `Top three for ${member.topThreeStreak} rounds running`,
        tally: member.topThreeStreak,
      });
    }
  }
  for (const member of all) {
    if (member.roundsWon > 0) {
      badges.push({
        id: "crowned",
        memberId: member.memberId,
        title: member.roundsWon === 1 ? "Crowned" : `Crowned ×${member.roundsWon}`,
        detail: member.roundsWon === 1 ? "Won a round" : `Won ${member.roundsWon} rounds`,
        tally: member.roundsWon,
      });
    }
  }
  for (const member of all) {
    if (member.spoons >= 2) {
      badges.push({
        id: "spoon-collector",
        memberId: member.memberId,
        title: "Spoon collector",
        detail: `${member.spoons} wooden spoons`,
        tally: member.spoons,
      });
    }
  }
  return badges;
}
