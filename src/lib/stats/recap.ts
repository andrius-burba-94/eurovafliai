/**
 * One Euroleague night for a league — slice 5.4.
 *
 * Pure: the page reads snapshots, windows, box scores and deals; this ranks
 * that round, names the best night, and names the deal that moved most.
 * Rank is this round's tenths, not season-to-date. Best night is whoever
 * scored it while covering the round, including a player who arrived in a
 * trade. Swing math is `impactForMember` for that round only.
 */

import { coversRound } from "@/lib/memberships/from";

import {
  impactForMember,
  type ImpactLine,
  type ImpactTransaction,
  type ImpactType,
} from "./impact";
import type { SnapshotRow } from "./standings";

export type RecapWindow = {
  readonly memberId: string;
  readonly playerId: string;
  readonly from_round?: number | null;
  readonly to_round?: number | null;
  readonly to_date?: string | null;
};

export type RecapRow = {
  readonly memberId: string;
  readonly tenths: number;
};

export type RecapBestNight = {
  readonly playerId: string;
  readonly memberId: string;
  readonly fantasyTenths: number;
};

export type RecapSwing = {
  readonly transactionId: string;
  readonly type: ImpactType;
  readonly fromRound: number;
  readonly memberId: string;
  readonly counterpartId: string;
  readonly deltaTenths: number;
  readonly inIds: readonly string[];
  readonly outIds: readonly string[];
};

export type Recap = {
  readonly round: number;
  readonly rows: readonly RecapRow[];
  readonly bestNight: RecapBestNight | null;
  readonly biggestSwing: RecapSwing | null;
};

function rankRound(table: readonly SnapshotRow[]): RecapRow[] {
  return [...table]
    .map((row) => ({ memberId: row.memberId, tenths: row.roundTenths }))
    .sort((a, b) => {
      if (b.tenths !== a.tenths) return b.tenths - a.tenths;
      return a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0;
    });
}

function tenthsByPlayer(
  lines: readonly ImpactLine[],
  round: number,
): Map<string, number> {
  const byPlayer = new Map<string, number>();
  for (const line of lines) {
    if (line.round !== round) continue;
    byPlayer.set(
      line.playerId,
      (byPlayer.get(line.playerId) ?? 0) + line.fantasyTenths,
    );
  }
  return byPlayer;
}

function ownerThatRound(
  windows: readonly RecapWindow[],
  playerId: string,
  round: number,
): string | null {
  const owners = windows
    .filter(
      (window) => window.playerId === playerId && coversRound(window, round),
    )
    .map((window) => window.memberId)
    .sort();
  return owners[0] ?? null;
}

function bestNight(
  windows: readonly RecapWindow[],
  lines: readonly ImpactLine[],
  round: number,
): RecapBestNight | null {
  const covering = windows.filter((window) => coversRound(window, round));
  if (covering.length === 0) return null;

  const scored = tenthsByPlayer(lines, round);
  let winner: RecapBestNight | null = null;
  const seen = new Set<string>();
  for (const window of covering) {
    if (seen.has(window.playerId)) continue;
    seen.add(window.playerId);
    const memberId = ownerThatRound(windows, window.playerId, round);
    if (!memberId) continue;
    const fantasyTenths = scored.get(window.playerId) ?? 0;
    const candidate: RecapBestNight = {
      playerId: window.playerId,
      memberId,
      fantasyTenths,
    };
    if (
      !winner ||
      candidate.fantasyTenths > winner.fantasyTenths ||
      (candidate.fantasyTenths === winner.fantasyTenths &&
        candidate.playerId < winner.playerId)
    ) {
      winner = candidate;
    }
  }
  return winner;
}

function membersOf(tx: ImpactTransaction): string[] {
  return [
    ...new Set([...Object.keys(tx.playersIn), ...Object.keys(tx.playersOut)]),
  ].sort();
}

function biggestSwing(
  transactions: readonly ImpactTransaction[],
  lines: readonly ImpactLine[],
  round: number,
): RecapSwing | null {
  const covering = transactions.filter((tx) => tx.fromRound <= round);
  if (covering.length === 0) return null;

  const candidates: RecapSwing[] = [];
  for (const tx of covering) {
    const memberIds = membersOf(tx);
    let winner: RecapSwing | null = null;
    for (const memberId of memberIds) {
      const [deal] = impactForMember(memberId, [tx], lines);
      if (!deal) continue;
      const deltaTenths =
        deal.byRound.find((row) => row.round === round)?.deltaTenths ?? 0;
      const counterpartId = memberIds.find((id) => id !== memberId) ?? "";
      const candidate: RecapSwing = {
        transactionId: tx.id,
        type: deal.type,
        fromRound: deal.fromRound,
        memberId,
        counterpartId,
        deltaTenths,
        inIds: deal.inIds,
        outIds: deal.outIds,
      };
      if (
        !winner ||
        candidate.deltaTenths > winner.deltaTenths ||
        (candidate.deltaTenths === winner.deltaTenths &&
          candidate.memberId < winner.memberId)
      ) {
        winner = candidate;
      }
    }
    if (winner) candidates.push(winner);
  }

  if (candidates.length === 0) return null;
  return [...candidates].sort((a, b) => {
    const absA = Math.abs(a.deltaTenths);
    const absB = Math.abs(b.deltaTenths);
    if (absB !== absA) return absB - absA;
    if (b.deltaTenths !== a.deltaTenths) return b.deltaTenths - a.deltaTenths;
    return a.transactionId < b.transactionId
      ? -1
      : a.transactionId > b.transactionId
        ? 1
        : a.memberId < b.memberId
          ? -1
          : a.memberId > b.memberId
            ? 1
            : 0;
  })[0]!;
}

export function recapForRound(
  round: number,
  table: readonly SnapshotRow[],
  windows: readonly RecapWindow[],
  lines: readonly ImpactLine[],
  transactions: readonly ImpactTransaction[],
): Recap {
  return {
    round,
    rows: rankRound(table),
    bestNight: bestNight(windows, lines, round),
    biggestSwing: biggestSwing(transactions, lines, round),
  };
}
