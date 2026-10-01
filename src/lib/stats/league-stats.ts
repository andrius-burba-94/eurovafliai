import type { Position } from "@/lib/engine";
import { DEFAULT_LINEUP_TEMPLATE, type LineupTemplate, type LineupWeights, type ResolvedLineup } from "@/lib/lineups/lineup";
import { optimizeLineup } from "@/lib/lineups/optimize";
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

export type StatsLine = {
  readonly playerId: string;
  readonly round: number;
  readonly fantasyTenths: number;
  /** The club he played that game for, so a mid-season move counts for the right one. */
  readonly clubCode?: string;
};

export type StatsPick = {
  readonly overallNo: number;
  readonly round: number;
  readonly memberId: string;
  readonly playerId: string;
};

export type StatsInput = {
  /** Finished rounds only. Every section counts these rounds and no others. */
  readonly snapshots: readonly RoundSnapshot[];
  readonly lines: readonly StatsLine[];
  readonly windows: readonly StatsWindow[];
  readonly weights: LineupWeights;
  /** Each member's lineup per round, for who started and who wore the armband. */
  readonly lineups?: readonly ResolvedLineup[];
  readonly template?: LineupTemplate;
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
};

/** Every team's finish in every finished round, ordered by the table. */
export type WaffleBoard = {
  readonly rounds: readonly number[];
  readonly teams: number;
  readonly rows: readonly {
    readonly memberId: string;
    /** 1 + the teams that outscored them that night; null for a night nobody scored. */
    readonly places: readonly (number | null)[];
  }[];
};

/** What a team's lineups scored against the best lineup its own squad allowed, looking back. */
export type Hindsight = {
  readonly memberId: string;
  readonly rounds: number;
  readonly actualTenths: number;
  readonly bestTenths: number;
  /** Actual over best, whole percent; null when the squad scored nothing at all. */
  readonly iqPercent: number | null;
  /** The round that left most on the table. */
  readonly worst: { readonly round: number; readonly lostTenths: number } | null;
};

export type CaptainRegret = {
  readonly memberId: string;
  readonly rounds: number;
  /** Rounds where the armband was on the best starter that night. */
  readonly perfect: number;
  /** The captain's bonus the best starter would have added, summed. */
  readonly regretTenths: number;
  readonly worst: {
    readonly round: number;
    readonly captainId: string;
    readonly bestId: string;
    readonly regretTenths: number;
  } | null;
};

export type ClubLoyalty = {
  readonly memberId: string;
  readonly totalTenths: number;
  /** Counted points by EuroLeague club, most first. */
  readonly clubs: readonly { readonly clubCode: string; readonly tenths: number }[];
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
  readonly waffle: WaffleBoard;
  readonly hindsight: readonly Hindsight[];
  readonly captains: readonly CaptainRegret[];
  readonly clubs: readonly ClubLoyalty[];
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
  return {
    steals: [...late].sort((a, b) => b.tenths - a.tenths || a.overallNo - b.overallNo).slice(0, 3),
    busts: [...early].sort((a, b) => a.tenths - b.tenths || a.overallNo - b.overallNo).slice(0, 3),
  };
}

function placeIn(snapshot: RoundSnapshot, memberId: string): number | null {
  const mine = snapshot.table.find((row) => row.memberId === memberId);
  if (!mine || !snapshot.table.some((row) => row.roundHundredths > 0)) return null;
  return 1 + snapshot.table.filter((row) => row.roundHundredths > mine.roundHundredths).length;
}

function waffleBoard(snapshots: readonly RoundSnapshot[]): WaffleBoard {
  const latest = snapshots.at(-1);
  const members = [...new Set(snapshots.flatMap((snapshot) => snapshot.table.map((row) => row.memberId)))];
  const total = (memberId: string) => latest?.table.find((row) => row.memberId === memberId)?.totalHundredths ?? 0;
  return {
    rounds: snapshots.map((snapshot) => snapshot.round),
    teams: members.length,
    rows: members
      .sort((a, b) => total(b) - total(a) || a.localeCompare(b))
      .map((memberId) => ({ memberId, places: snapshots.map((snapshot) => placeIn(snapshot, memberId)) })),
  };
}

function squadAt(windows: readonly StatsWindow[], memberId: string, round: number): string[] {
  return [...new Set(windows.filter((window) => window.memberId === memberId && coversRound(window, round)).map((window) => window.playerId))];
}

function pointsByRound(lines: readonly StatsLine[]): Map<number, Map<string, number>> {
  const out = new Map<number, Map<string, number>>();
  for (const line of lines) {
    const round = out.get(line.round) ?? new Map<string, number>();
    round.set(line.playerId, (round.get(line.playerId) ?? 0) + line.fantasyTenths);
    out.set(line.round, round);
  }
  return out;
}

/**
 * Each recorded round replayed with the squad's real points: `optimizeLineup`
 * finds the best legal lineup, and the gap to what was set is what hindsight
 * says was left behind. A round nobody recorded scored everyone at 100% and
 * is not judged.
 */
function hindsight(input: StatsInput, rounds: readonly number[], points: Map<number, Map<string, number>>): Hindsight[] {
  const template = input.template ?? DEFAULT_LINEUP_TEMPLATE;
  const members = [...new Set(input.windows.map((window) => window.memberId))];
  return members
    .map((memberId) => {
      let actualHalf = 0;
      let bestHalf = 0;
      let counted = 0;
      let worst: Hindsight["worst"] = null;
      for (const round of rounds) {
        if (input.weights.sourceFor(memberId, round) === "absent") continue;
        const squad = squadAt(input.windows, memberId, round).filter((id) => input.positions[id]);
        const night = points.get(round);
        const scored = (id: string) => night?.get(id) ?? 0;
        const best = optimizeLineup(
          squad.map((id) => ({ id, position: input.positions[id]!, estimateTenths: scored(id), currentRole: null })),
          template,
        );
        if (!best) continue;
        const actual = squad.reduce((sum, id) => sum + Math.round(scored(id) * input.weights.multiplierFor(memberId, round, id) * 2), 0);
        // An arrival a carried lineup never named scores at 100%, which can beat
        // any legal lineup; hindsight cannot ask for less than what happened.
        const ceiling = Math.max(best.scoreHalfTenths, actual);
        actualHalf += actual;
        bestHalf += ceiling;
        counted += 1;
        const lostTenths = Math.round((ceiling - actual) / 2);
        if (lostTenths > 0 && (!worst || lostTenths > worst.lostTenths)) worst = { round, lostTenths };
      }
      return {
        memberId,
        rounds: counted,
        actualTenths: Math.round(actualHalf / 2),
        bestTenths: Math.round(bestHalf / 2),
        iqPercent: bestHalf > 0 ? Math.round((actualHalf / bestHalf) * 100) : null,
        worst,
      };
    })
    .filter((row) => row.rounds > 0)
    .sort((a, b) => (b.iqPercent ?? -1) - (a.iqPercent ?? -1) || a.memberId.localeCompare(b.memberId));
}

/** The armband against the best starter of the same five, round by round. */
function captainRegret(input: StatsInput, rounds: readonly number[], points: Map<number, Map<string, number>>): CaptainRegret[] {
  const counted = new Set(rounds);
  const byMember = new Map<string, { rounds: number; perfect: number; regretTenths: number; worst: CaptainRegret["worst"] }>();
  for (const lineup of input.lineups ?? []) {
    if (lineup.source === "absent" || !lineup.slots?.captain || !counted.has(lineup.round)) continue;
    const owned = new Set(squadAt(input.windows, lineup.memberId, lineup.round));
    const starters = lineup.slots.starters.filter((id) => owned.has(id));
    if (!owned.has(lineup.slots.captain) || starters.length === 0) continue;
    const night = points.get(lineup.round);
    const scored = (id: string) => night?.get(id) ?? 0;
    const captainId = lineup.slots.captain;
    const bestId = [...starters].sort((a, b) => scored(b) - scored(a) || Number(b === captainId) - Number(a === captainId) || a.localeCompare(b))[0]!;
    const regret = Math.max(0, scored(bestId) - scored(captainId));
    const entry = byMember.get(lineup.memberId) ?? { rounds: 0, perfect: 0, regretTenths: 0, worst: null };
    entry.rounds += 1;
    if (regret === 0) entry.perfect += 1;
    entry.regretTenths += regret;
    if (regret > 0 && (!entry.worst || regret > entry.worst.regretTenths)) {
      entry.worst = { round: lineup.round, captainId, bestId, regretTenths: regret };
    }
    byMember.set(lineup.memberId, entry);
  }
  return [...byMember.entries()]
    .map(([memberId, entry]) => ({ memberId, ...entry }))
    .sort((a, b) => a.regretTenths - b.regretTenths || a.memberId.localeCompare(b.memberId));
}

/** Counted points by the club each player wore that night. */
function clubLoyalty(input: StatsInput, lines: readonly StatsLine[]): ClubLoyalty[] {
  const byMember = new Map<string, Map<string, number>>();
  for (const line of lines) {
    if (!line.clubCode) continue;
    const owner = ownerAt(input.windows, line.playerId, line.round);
    if (!owner) continue;
    const counted = line.fantasyTenths * input.weights.multiplierFor(owner, line.round, line.playerId);
    if (counted === 0) continue;
    const clubs = byMember.get(owner) ?? new Map<string, number>();
    clubs.set(line.clubCode, (clubs.get(line.clubCode) ?? 0) + counted);
    byMember.set(owner, clubs);
  }
  return [...byMember.entries()]
    .map(([memberId, clubs]) => {
      const rows = [...clubs.entries()]
        .map(([clubCode, tenths]) => ({ clubCode, tenths: Math.round(tenths) }))
        .sort((a, b) => b.tenths - a.tenths || a.clubCode.localeCompare(b.clubCode));
      return { memberId, totalTenths: rows.reduce((sum, row) => sum + row.tenths, 0), clubs: rows };
    })
    .sort((a, b) => b.totalTenths - a.totalTenths || a.memberId.localeCompare(b.memberId));
}

export type HeadToHead = {
  readonly a: string;
  readonly b: string;
  readonly aWins: number;
  readonly bWins: number;
  readonly ties: number;
  /** Per finished round both teams played: a's round score minus b's. */
  readonly rounds: readonly { readonly round: number; readonly marginHundredths: number }[];
};

/** Two teams, round by round: who outscored whom, and by how much. */
export function headToHead(snapshots: readonly RoundSnapshot[], a: string, b: string): HeadToHead {
  const rounds = snapshots.flatMap((snapshot) => {
    const left = snapshot.table.find((row) => row.memberId === a);
    const right = snapshot.table.find((row) => row.memberId === b);
    return left && right ? [{ round: snapshot.round, marginHundredths: left.roundHundredths - right.roundHundredths }] : [];
  });
  return {
    a,
    b,
    aWins: rounds.filter((row) => row.marginHundredths > 0).length,
    bWins: rounds.filter((row) => row.marginHundredths < 0).length,
    ties: rounds.filter((row) => row.marginHundredths === 0).length,
    rounds,
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

export function leagueStats(raw: StatsInput): LeagueStats {
  const rounds = raw.snapshots.map((snapshot) => snapshot.round);
  const finished = new Set(rounds);
  const input: StatsInput = { ...raw, lines: raw.lines.filter((line) => finished.has(line.round)) };
  const points = pointsByRound(input.lines);
  return {
    rounds,
    records: records(input),
    teams: teamProfiles(input),
    lineups: lineupEfficiency(input),
    draft: draftValue(input),
    players: playerLeaders(input),
    waffle: waffleBoard(input.snapshots),
    hindsight: hindsight(input, rounds, points),
    captains: captainRegret(input, rounds, points),
    clubs: clubLoyalty(input, input.lines),
  };
}
