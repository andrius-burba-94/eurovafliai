/**
 * What one stat import would do, worked out before anything is written.
 *
 * Pure — no PocketBase, no clock — like `src/lib/rosters/diff.ts`, and for the
 * same two reasons: the commissioner's preview renders this, and
 * `stat_imports.plan` stores it, so a run is auditable and re-appliable
 * whether or not it was applied (blueprint D8).
 *
 * The rules that matter here are about **not silently losing a row**:
 *
 * - Matching is by **person code only**. Roster ingestion falls back to
 *   normalized name + club because 13% of E2026 players have no code yet; a box
 *   score does not get that fallback, because a fuzzy match that lands on the
 *   wrong player writes points into somebody else's season and nothing ever
 *   says so. An unmatched code is reported by name and left for 4.2's
 *   reconciliation pass.
 * - A row whose numbers are identical to what is stored is **unchanged**, not
 *   an update. That is what makes re-running an import cheap and what makes a
 *   half-finished run produce exactly its own remainder on the second go.
 * - An update carries **what it changes from**. A box score being corrected is
 *   normal — the Euroleague amends them — but a correction that quietly
 *   rewrites a scored game is the sort of thing standings arguments are made
 *   of, so the before values are in the batch.
 */
import type { ParsedStatRow } from "./csv";
import {
  OFFICIAL_WEIGHTS,
  OFFICIAL_WIN_BONUS,
  type ScoringWeights,
  scoreGame,
} from "./scoring";

/** The stored shape, in PocketBase's own field names. */
export type StatRowFields = {
  readonly player: string;
  readonly season: string;
  readonly game_code: number;
  readonly round: number;
  readonly phase: "RS" | "PI" | "PO" | "FF";
  readonly club_code: string;
  readonly team_score: number;
  readonly opponent_score: number;
  readonly time_played: number;
  readonly points: number;
  readonly fgm2: number;
  readonly fga2: number;
  readonly fgm3: number;
  readonly fga3: number;
  readonly ftm: number;
  readonly fta: number;
  readonly reb_off: number;
  readonly reb_def: number;
  readonly reb_total: number;
  readonly assists: number;
  readonly steals: number;
  readonly turnovers: number;
  readonly blocks_for: number;
  readonly blocks_against: number;
  readonly fouls_committed: number;
  readonly fouls_drawn: number;
  readonly plus_minus: number;
  readonly pir: number;
  readonly fantasy_pts: number;
};

/** A row already in the table, as far as this module cares. */
export type ExistingStatRow = StatRowFields & { readonly id: string };

/** A player we can attach a box score to. */
export type StatPlayer = {
  readonly id: string;
  readonly personCode: string;
  readonly name: string;
};

export type StatChange = {
  readonly field: keyof StatRowFields;
  readonly from: number | string;
  readonly to: number | string;
};

export type StatPlan = {
  readonly creates: { readonly fields: StatRowFields; readonly line: number }[];
  readonly updates: {
    readonly id: string;
    readonly fields: StatRowFields;
    readonly changes: StatChange[];
    readonly line: number;
  }[];
  readonly unchanged: number;
  /** Person codes the pool has never heard of, with the games they appeared in. */
  readonly unmatched: {
    readonly personCode: string;
    readonly lines: number[];
  }[];
  /** How many distinct games this batch touches, and which rounds. */
  readonly games: number;
  readonly rounds: number[];
};

/** Fields compared to decide whether a stored row needs rewriting. */
const COMPARED: readonly (keyof StatRowFields)[] = [
  "round",
  "phase",
  "club_code",
  "team_score",
  "opponent_score",
  "time_played",
  "points",
  "fgm2",
  "fga2",
  "fgm3",
  "fga3",
  "ftm",
  "fta",
  "reb_off",
  "reb_def",
  "reb_total",
  "assists",
  "steals",
  "turnovers",
  "blocks_for",
  "blocks_against",
  "fouls_committed",
  "fouls_drawn",
  "plus_minus",
  "pir",
  "fantasy_pts",
];

const key = (playerId: string, season: string, gameCode: number) =>
  `${playerId}|${season}|${gameCode}`;

/**
 * Turn a parsed row into the stored shape, scoring it on the way.
 *
 * Exported because the fetcher (4.3) writes the same rows from a different
 * source and must not reimplement this mapping — one place where a box score
 * becomes a record, so the CSV path and the API path cannot disagree about
 * what a stored game means.
 */
export function toStatFields(
  row: ParsedStatRow,
  {
    playerId,
    season,
    weights = OFFICIAL_WEIGHTS,
    winBonus = OFFICIAL_WIN_BONUS,
  }: {
    playerId: string;
    season: string;
    weights?: ScoringWeights;
    winBonus?: number;
  },
): StatRowFields {
  const { base, fantasyTenths } = scoreGame(
    row.box,
    row.won,
    weights,
    winBonus,
  );
  return {
    player: playerId,
    season,
    game_code: row.gameCode,
    round: row.round,
    phase: row.phase,
    club_code: row.clubCode,
    team_score: row.teamScore,
    opponent_score: row.opponentScore,
    time_played: row.box.timePlayed,
    points: row.box.points,
    fgm2: row.box.fieldGoalsMade2,
    fga2: row.box.fieldGoalsAttempted2,
    fgm3: row.box.fieldGoalsMade3,
    fga3: row.box.fieldGoalsAttempted3,
    ftm: row.box.freeThrowsMade,
    fta: row.box.freeThrowsAttempted,
    reb_off: row.box.offensiveRebounds,
    reb_def: row.box.defensiveRebounds,
    reb_total: row.box.totalRebounds,
    assists: row.box.assistances,
    steals: row.box.steals,
    turnovers: row.box.turnovers,
    blocks_for: row.box.blocksFavour,
    blocks_against: row.box.blocksAgainst,
    fouls_committed: row.box.foulsCommited,
    fouls_drawn: row.box.foulsReceived,
    plus_minus: row.box.plusMinus,
    pir: base,
    fantasy_pts: fantasyTenths,
  };
}

export function planStatImport({
  rows,
  players,
  existing,
  season,
  weights = OFFICIAL_WEIGHTS,
  winBonus = OFFICIAL_WIN_BONUS,
}: {
  rows: readonly ParsedStatRow[];
  players: readonly StatPlayer[];
  existing: readonly ExistingStatRow[];
  season: string;
  weights?: ScoringWeights;
  winBonus?: number;
}): StatPlan {
  const byCode = new Map<string, StatPlayer>();
  for (const player of players) {
    if (player.personCode) byCode.set(player.personCode, player);
  }
  const stored = new Map<string, ExistingStatRow>();
  for (const row of existing) {
    stored.set(key(row.player, row.season, row.game_code), row);
  }

  const creates: StatPlan["creates"] = [];
  const updates: StatPlan["updates"] = [];
  const unmatched = new Map<string, number[]>();
  const games = new Set<number>();
  const rounds = new Set<number>();
  let unchanged = 0;

  for (const row of rows) {
    const player = byCode.get(row.personCode);
    if (!player) {
      const lines = unmatched.get(row.personCode) ?? [];
      lines.push(row.line);
      unmatched.set(row.personCode, lines);
      continue;
    }

    games.add(row.gameCode);
    rounds.add(row.round);

    const fields = toStatFields(row, {
      playerId: player.id,
      season,
      weights,
      winBonus,
    });
    const current = stored.get(key(player.id, season, row.gameCode));
    if (!current) {
      creates.push({ fields, line: row.line });
      continue;
    }

    const changes = COMPARED.filter(
      (field) => current[field] !== fields[field],
    ).map((field) => ({
      field,
      from: current[field],
      to: fields[field],
    }));

    if (changes.length === 0) {
      unchanged += 1;
      continue;
    }
    updates.push({ id: current.id, fields, changes, line: row.line });
  }

  return {
    creates,
    updates,
    unchanged,
    unmatched: [...unmatched.entries()].map(([personCode, lines]) => ({
      personCode,
      lines,
    })),
    games: games.size,
    rounds: [...rounds].sort((a, b) => a - b),
  };
}

/** One sentence saying what a plan would do. Shared by the page and the log. */
export function describeStatPlan(plan: StatPlan): string {
  const parts: string[] = [];
  if (plan.creates.length > 0) {
    parts.push(
      `${plan.creates.length} new game line${plan.creates.length === 1 ? "" : "s"}`,
    );
  }
  if (plan.updates.length > 0) {
    parts.push(
      `${plan.updates.length} correction${plan.updates.length === 1 ? "" : "s"}`,
    );
  }
  if (plan.unchanged > 0) parts.push(`${plan.unchanged} already stored`);
  if (parts.length === 0) return "Nothing to store.";

  const rounds =
    plan.rounds.length === 0
      ? ""
      : plan.rounds.length === 1
        ? ` in round ${plan.rounds[0]}`
        : ` across rounds ${plan.rounds[0]}–${plan.rounds[plan.rounds.length - 1]}`;
  return `${parts.join(", ")} — ${plan.games} game${plan.games === 1 ? "" : "s"}${rounds}.`;
}
