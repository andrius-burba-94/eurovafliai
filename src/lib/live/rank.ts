import { coversRound } from "@/lib/memberships/from";
import { weighHundredths } from "@/lib/stats/scoring";
import type { LineupWeights } from "@/lib/lineups/lineup";

export type ScoredGameLine = {
  readonly playerId: string;
  readonly gameCode: number;
  readonly fantasyTenths: number;
};

export type ProvisionalRank = {
  readonly memberId: string;
  readonly totalHundredths: number;
  readonly roundHundredths: number;
  readonly rank: number;
};

/** Finished rows replace any snapshot for the same player and game. */
export function provisionalRanks(input: {
  readonly memberIds: readonly string[];
  readonly baseTotals: Readonly<Record<string, number>>;
  readonly memberships: readonly { member: string; player: string; from_round?: number | null; to_round?: number | null; to_date?: string | null }[];
  readonly finalLines: readonly ScoredGameLine[];
  readonly liveLines: readonly ScoredGameLine[];
  readonly round: number;
  readonly weights: LineupWeights;
}): ProvisionalRank[] {
  const finalKeys = new Set(input.finalLines.map((line) => `${line.playerId}|${line.gameCode}`));
  const lines = [...input.finalLines, ...input.liveLines.filter((line) => !finalKeys.has(`${line.playerId}|${line.gameCode}`))];
  const byPlayer = new Map<string, number>();
  for (const line of lines) byPlayer.set(line.playerId, (byPlayer.get(line.playerId) ?? 0) + line.fantasyTenths);
  const rows = input.memberIds.map((memberId) => {
    const roundHundredths = input.memberships.reduce((sum, window) => {
      if (window.member !== memberId || !coversRound(window, input.round)) return sum;
      return sum + weighHundredths(byPlayer.get(window.player) ?? 0, input.weights.multiplierFor(memberId, input.round, window.player));
    }, 0);
    return { memberId, roundHundredths, totalHundredths: (input.baseTotals[memberId] ?? 0) + roundHundredths };
  });
  rows.sort((a, b) => b.totalHundredths - a.totalHundredths || a.memberId.localeCompare(b.memberId));
  return rows.map((row, index) => ({ ...row, rank: index + 1 }));
}
