import type { Position } from "@/lib/engine";
import type { LineupWeights } from "@/lib/lineups/lineup";
import { coversRound } from "@/lib/memberships/from";
import { memberHonours } from "@/lib/season/badges";

import type { RoundSnapshot } from "./standings";

/**
 * League Stats (ADR-0011, S10): the season's records, each team's profile,
 * how well lineups were set, what the draft was worth, who the players of the
 * season are, and how the market went — all derived from rows the app already
 * stores. Pure: the query reads, this computes, the page draws.
 *
 * Units follow their source and are never mixed: snapshot figures are
 * hundredths (a lineup-weighted round total), box-score figures are tenths
 * (one player's night).
 */

export type StatsWindow = {
  readonly memberId: string;
  readonly playerId: string;
  readonly from_round?: number | null;
  readonly to_round?: number | null;
  readonly to_date?: string | null;
};

export type StatsLine = { readonly playerId: string; readonly round: number; readonly fantasyTenths: number };

export type StatsPick = {
  readonly overallNo: number;
  readonly round: number;
  readonly memberId: string;
  readonly playerId: string;
  readonly isAuto: boolean;
};

export type StatsInput = {
  readonly snapshots: readonly RoundSnapshot[];
  readonly lines: readonly StatsLine[];
  readonly windows: readonly StatsWindow[];
  readonly weights: LineupWeights;
  readonly picks: readonly StatsPick[];
  readonly positions: Readonly<Record<string, Position>>;
};

export type TeamRecord = { readonly memberId: string; readonly round: number; readonly hundredths: number };
export type NightRecord = { readonly memberId: string; readonly playerId: string; readonly round: number; readonly tenths: number };

export type Records = {
  readonly highestRound: TeamRecord | null;
  readonly lowestRound: TeamRecord | null;
  readonly biggestMargin: (TeamRecord & { readonly marginHundredths: number }) | null;
  readonly bestNight: NightRecord | null;
  /** The biggest captain's night, counted at the armband's ×2. */
  readonly bestCaptainNight: NightRecord | null;
};

export type TeamProfile = {
  readonly memberId: string;
  readonly rounds: number;
  readonly averageHundredths: number;
  readonly bestHundredths: number;
  readonly worstHundredths: number;
  /** Standard deviation of round scores — lower is steadier. */
  readonly spreadHundredths: number;
  readonly roundsWon: number;
  readonly topThree: number;
  readonly spoons: number;
};

export type LineupEfficiency = {
  readonly memberId: string;
  /** Points left on the bench and in the stands: raw minus counted, in tenths. */
  readonly benchLostTenths: number;
  /** Rounds with a recorded captain. */
  readonly captainRounds: number;
  /** Of those, rounds where the captain was the best starter that night. */
  readonly captainHits: number;
};

export type DraftPickValue = StatsPick & { readonly tenths: number };

export type DraftValue = {
  readonly steals: readonly DraftPickValue[];
  readonly busts: readonly DraftPickValue[];
  readonly autoAverageTenths: number | null;
  readonly humanAverageTenths: number | null;
  readonly autoPicks: number;
};

export type PlayerLeader = {
  readonly playerId: string;
  readonly tenths: number;
  readonly games: number;
  /** Who holds them after the latest counted round, or null for a free agent. */
  readonly ownerId: string | null;
};

export type PlayerLeaders = {
  readonly overall: readonly PlayerLeader[];
  readonly byPosition: Readonly<Record<Position, readonly PlayerLeader[]>>;
  /** Best average over the last three counted rounds, at least two games. */
  readonly hot: readonly PlayerLeader[];
  readonly freeAgents: readonly PlayerLeader[];
};

export type LeagueStats = {
  readonly rounds: readonly number[];
  readonly records: Records;
  readonly teams: readonly TeamProfile[];
  readonly lineups: readonly LineupEfficiency[];
  readonly draft: DraftValue;
  readonly players: PlayerLeaders;
};

function ownerAt(windows: readonly StatsWindow[], playerId: string, round: number): string | null {
  return windows.find((window) => window.playerId === playerId && coversRound(window, round))?.memberId ?? null;
}

function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.round(Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length));
}

function records(input: StatsInput): Records {
  const rows = input.snapshots.flatMap((snapshot) =>
    snapshot.table.map((row) => ({ memberId: row.memberId, round: snapshot.round, hundredths: row.roundHundredths })),
  );
  const scored = rows.filter((row) => row.hundredths > 0);
  const highestRound = scored.reduce<TeamRecord | null>((best, row) => (!best || row.hundredths > best.hundredths ? row : best), null);
  const lowestRound = scored.reduce<TeamRecord | null>((low, row) => (!low || row.hundredths < low.hundredths ? row : low), null);

  let biggestMargin: Records["biggestMargin"] = null;
  for (const snapshot of input.snapshots) {
    const sorted = [...snapshot.table].sort((a, b) => b.roundHundredths - a.roundHundredths);
    if (sorted.length < 2 || sorted[0]!.roundHundredths <= 0) continue;
    const margin = sorted[0]!.roundHundredths - sorted[1]!.roundHundredths;
    if (!biggestMargin || margin > biggestMargin.marginHundredths) {
      biggestMargin = { memberId: sorted[0]!.memberId, round: snapshot.round, hundredths: sorted[0]!.roundHundredths, marginHundredths: margin };
    }
  }

  let bestNight: NightRecord | null = null;
  let bestCaptainNight: NightRecord | null = null;
  for (const line of input.lines) {
    const owner = ownerAt(input.windows, line.playerId, line.round);
    if (!owner) continue;
    if (!bestNight || line.fantasyTenths > bestNight.tenths) {
      bestNight = { memberId: owner, playerId: line.playerId, round: line.round, tenths: line.fantasyTenths };
    }
    const multiplier = input.weights.multiplierFor(owner, line.round, line.playerId);
    if (multiplier === 2 && (!bestCaptainNight || line.fantasyTenths * 2 > bestCaptainNight.tenths)) {
      bestCaptainNight = { memberId: owner, playerId: line.playerId, round: line.round, tenths: line.fantasyTenths * 2 };
    }
  }
  return { highestRound, lowestRound, biggestMargin, bestNight, bestCaptainNight };
}

function teamProfiles(input: StatsInput): TeamProfile[] {
  const honours = new Map(memberHonours(input.snapshots).map((row) => [row.memberId, row]));
  const members = [...new Set(input.snapshots.flatMap((snapshot) => snapshot.table.map((row) => row.memberId)))];
  return members
    .map((memberId) => {
      const scores = input.snapshots.flatMap((snapshot) =>
        snapshot.table.filter((row) => row.memberId === memberId).map((row) => row.roundHundredths),
      );
      const topThree = input.snapshots.filter((snapshot) => {
        const mine = snapshot.table.find((row) => row.memberId === memberId);
        if (!mine || mine.roundHundredths <= 0) return false;
        return 1 + snapshot.table.filter((row) => row.roundHundredths > mine.roundHundredths).length <= 3;
      }).length;
      const honour = honours.get(memberId);
      return {
        memberId,
        rounds: scores.length,
        averageHundredths: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        bestHundredths: scores.length ? Math.max(...scores) : 0,
        worstHundredths: scores.length ? Math.min(...scores) : 0,
        spreadHundredths: stdev(scores),
        roundsWon: honour?.roundsWon ?? 0,
        topThree,
        spoons: honour?.spoons ?? 0,
      };
    })
    .sort((a, b) => b.averageHundredths - a.averageHundredths || a.memberId.localeCompare(b.memberId));
}

function lineupEfficiency(input: StatsInput): LineupEfficiency[] {
  const members = [...new Set(input.windows.map((window) => window.memberId))];
  const rounds = [...new Set(input.lines.map((line) => line.round))];
  return members
    .map((memberId) => {
      let benchLost = 0;
      let captainRounds = 0;
      let captainHits = 0;
      for (const round of rounds) {
        if (input.weights.sourceFor(memberId, round) === "absent") continue;
        const mine = input.lines.filter((line) => line.round === round && ownerAt(input.windows, line.playerId, round) === memberId);
        let captainScore: number | null = null;
        let bestStarter = -Infinity;
        for (const line of mine) {
          const multiplier = input.weights.multiplierFor(memberId, round, line.playerId);
          if (multiplier < 1 && line.fantasyTenths > 0) benchLost += Math.round(line.fantasyTenths * (1 - multiplier));
          if (multiplier >= 1) bestStarter = Math.max(bestStarter, line.fantasyTenths);
          if (multiplier === 2) captainScore = line.fantasyTenths;
        }
        if (captainScore !== null) {
          captainRounds += 1;
          if (captainScore >= bestStarter) captainHits += 1;
        }
      }
      return { memberId, benchLostTenths: benchLost, captainRounds, captainHits };
    })
    .sort((a, b) => b.benchLostTenths - a.benchLostTenths || a.memberId.localeCompare(b.memberId));
}

function draftValue(input: StatsInput): DraftValue {
  const valued: DraftPickValue[] = input.picks.map((pick) => ({
    ...pick,
    tenths: input.lines
      .filter((line) => line.playerId === pick.playerId && ownerAt(input.windows, line.playerId, line.round) === pick.memberId)
      .reduce((sum, line) => sum + line.fantasyTenths, 0),
  }));
  const rounds = Math.max(0, ...input.picks.map((pick) => pick.round));
  const late = valued.filter((pick) => pick.round > rounds / 2);
  const early = valued.filter((pick) => pick.round <= Math.max(1, Math.floor(rounds / 4)));
  const average = (rows: readonly DraftPickValue[]) =>
    rows.length ? Math.round(rows.reduce((sum, row) => sum + row.tenths, 0) / rows.length) : null;
  const auto = valued.filter((pick) => pick.isAuto);
  return {
    steals: [...late].sort((a, b) => b.tenths - a.tenths || a.overallNo - b.overallNo).slice(0, 3),
    busts: [...early].sort((a, b) => a.tenths - b.tenths || a.overallNo - b.overallNo).slice(0, 3),
    autoAverageTenths: average(auto),
    humanAverageTenths: average(valued.filter((pick) => !pick.isAuto)),
    autoPicks: auto.length,
  };
}

function playerLeaders(input: StatsInput): PlayerLeaders {
  const rounds = [...new Set(input.lines.map((line) => line.round))].sort((a, b) => a - b);
  const latest = rounds.at(-1) ?? 1;
  const recent = new Set(rounds.slice(-3));
  const totals = new Map<string, { tenths: number; games: number; recent: number; recentGames: number }>();
  for (const line of input.lines) {
    const entry = totals.get(line.playerId) ?? { tenths: 0, games: 0, recent: 0, recentGames: 0 };
    entry.tenths += line.fantasyTenths;
    entry.games += 1;
    if (recent.has(line.round)) {
      entry.recent += line.fantasyTenths;
      entry.recentGames += 1;
    }
    totals.set(line.playerId, entry);
  }
  const leaders = [...totals.entries()].map(([playerId, entry]) => ({
    playerId,
    tenths: entry.tenths,
    games: entry.games,
    ownerId: ownerAt(input.windows, playerId, latest),
  }));
  const byTotal = (a: PlayerLeader, b: PlayerLeader) => b.tenths - a.tenths || a.playerId.localeCompare(b.playerId);
  const top = (rows: PlayerLeader[], n: number) => [...rows].sort(byTotal).slice(0, n);
  const hot = [...totals.entries()]
    .filter(([, entry]) => entry.recentGames >= 2)
    .map(([playerId, entry]) => ({
      playerId,
      tenths: Math.round(entry.recent / entry.recentGames),
      games: entry.recentGames,
      ownerId: ownerAt(input.windows, playerId, latest),
    }))
    .sort(byTotal)
    .slice(0, 5);
  return {
    overall: top(leaders, 5),
    byPosition: {
      G: top(leaders.filter((row) => input.positions[row.playerId] === "G"), 3),
      F: top(leaders.filter((row) => input.positions[row.playerId] === "F"), 3),
      C: top(leaders.filter((row) => input.positions[row.playerId] === "C"), 3),
    },
    hot,
    freeAgents: top(leaders.filter((row) => row.ownerId === null), 5),
  };
}

export function leagueStats(input: StatsInput): LeagueStats {
  return {
    rounds: input.snapshots.map((snapshot) => snapshot.round),
    records: records(input),
    teams: teamProfiles(input),
    lineups: lineupEfficiency(input),
    draft: draftValue(input),
    players: playerLeaders(input),
  };
}
