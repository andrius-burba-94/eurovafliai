import { describe, expect, it } from "vitest";

import { parseStatCsv } from "./csv";
import {
  type ExistingStatRow,
  type StatPlayer,
  describeStatPlan,
  planStatImport,
  toStatFields,
} from "./plan";
import { OFFICIAL_WEIGHTS } from "./scoring";

const HEADER =
  "personCode,gameCode,round,clubCode,teamScore,opponentScore,points," +
  "fieldGoalsMade2,fieldGoalsAttempted2,fieldGoalsMade3,fieldGoalsAttempted3," +
  "freeThrowsMade,freeThrowsAttempted,totalRebounds,assistances,steals," +
  "turnovers,blocksFavour,blocksAgainst,foulsCommited,foulsReceived";

/** 7 points, 3 rebounds, 2 assists, 1 shot blocked, 2 fouls, 2 drawn → PIR 3. */
const LINE = "006590,1,1,IST,85,78,7,3,7,0,4,1,1,3,2,0,0,0,1,2,2";

const rowsFrom = (...lines: string[]) =>
  parseStatCsv([HEADER, ...lines].join("\n")).rows;

const PLAYERS: StatPlayer[] = [
  { id: "p_beaubois", personCode: "006590", name: "Beaubois" },
  { id: "p_other", personCode: "006591", name: "Somebody" },
  { id: "p_nocode", personCode: "", name: "Unregistered signing" },
];

const plan = (
  lines: string[],
  existing: ExistingStatRow[] = [],
  players = PLAYERS,
) =>
  planStatImport({
    rows: rowsFrom(...lines),
    players,
    existing,
    season: "E2026",
  });

const storedFrom = (
  line: string,
  id = "s1",
  over: Partial<ExistingStatRow> = {},
): ExistingStatRow => {
  const row = rowsFrom(line)[0]!;
  return {
    id,
    ...toStatFields(row, { playerId: "p_beaubois", season: "E2026" }),
    ...over,
  };
};

describe("planStatImport", () => {
  it("creates a line that is not stored yet, and scores it", () => {
    const result = plan([LINE]);
    expect(result.creates).toHaveLength(1);
    expect(result.updates).toEqual([]);
    expect(result.unchanged).toBe(0);
    expect(result.creates[0]!.fields).toMatchObject({
      player: "p_beaubois",
      season: "E2026",
      game_code: 1,
      round: 1,
      phase: "RS",
      club_code: "IST",
      pir: 3,
      // A win, so 3 × 1.1 = 3.3, stored as 33 tenths.
      fantasy_pts: 33,
    });
    expect(result.creates[0]!.line).toBe(2);
  });

  it("calls an identical row unchanged rather than an update", () => {
    // The property re-running an import rests on. Without it, every re-run
    // would rewrite every row it had already written.
    const result = plan([LINE], [storedFrom(LINE)]);
    expect(result.unchanged).toBe(1);
    expect(result.creates).toEqual([]);
    expect(result.updates).toEqual([]);
  });

  it("produces exactly the remainder of a half-finished run", () => {
    // The failure-recovery story, stated as a test: a run that died after one
    // row of three, re-run, plans the other two and nothing else.
    const lines = [
      LINE,
      LINE.replace("006590,1,", "006590,2,"),
      LINE.replace("006590,1,", "006590,3,"),
    ];
    const result = plan(lines, [storedFrom(lines[0]!)]);
    expect(result.unchanged).toBe(1);
    expect(result.creates.map((create) => create.fields.game_code)).toEqual([
      2, 3,
    ]);
  });

  it("updates a corrected box score and says what it changed from", () => {
    const corrected = LINE.replace(",85,78,7,", ",85,78,9,");
    const result = plan([corrected], [storedFrom(LINE)]);
    expect(result.creates).toEqual([]);
    expect(result.updates).toHaveLength(1);
    expect(result.updates[0]!.id).toBe("s1");
    expect(result.updates[0]!.changes).toEqual([
      { field: "points", from: 7, to: 9 },
      { field: "pir", from: 3, to: 5 },
      { field: "fantasy_pts", from: 33, to: 55 },
    ]);
  });

  it("notices a corrected scoreline, because it moves the win bonus", () => {
    // The same box score on a loss instead of a win is a different number of
    // fantasy points, and nothing else about the row changes. If the plan
    // compared only the stat components this would import as "unchanged".
    const flipped = LINE.replace(",85,78,", ",78,85,");
    const result = plan([flipped], [storedFrom(LINE)]);
    expect(result.updates[0]!.changes).toEqual([
      { field: "team_score", from: 85, to: 78 },
      { field: "opponent_score", from: 78, to: 85 },
      { field: "fantasy_pts", from: 33, to: 30 },
    ]);
  });

  it("does not confuse two players' identical lines", () => {
    const result = plan([LINE, LINE.replace("006590,", "006591,")]);
    expect(result.creates.map((create) => create.fields.player)).toEqual([
      "p_beaubois",
      "p_other",
    ]);
  });

  it("does not confuse one player's two games", () => {
    const result = plan(
      [LINE, LINE.replace("006590,1,1,", "006590,11,2,")],
      [storedFrom(LINE)],
    );
    expect(result.unchanged).toBe(1);
    expect(result.creates).toHaveLength(1);
    expect(result.creates[0]!.fields.game_code).toBe(11);
  });

  it("reports an unknown person code by code and line, and imports nothing for it", () => {
    // Matching is by code only, on purpose: a fuzzy match that lands on the
    // wrong player writes points into somebody else's season silently.
    const result = plan([
      LINE.replace("006590,1,", "099999,1,"),
      LINE.replace("006590,1,", "099999,2,"),
      LINE,
    ]);
    expect(result.unmatched).toEqual([
      { personCode: "099999", lines: [2, 3] },
    ]);
    expect(result.creates).toHaveLength(1);
    expect(result.games).toBe(1);
  });

  it("never matches a player who has no person code", () => {
    // `players` has rows with an empty code — 13% of E2026 at last count — and
    // an empty-string key would collect every one of them into one bucket.
    const result = plan([LINE.replace("006590,", ",")], []);
    expect(result.creates).toEqual([]);
    expect(result.unmatched).toEqual([]);
  });

  it("counts the games and rounds it touches", () => {
    const result = plan([
      LINE,
      LINE.replace("006590,1,1,", "006590,11,2,"),
      LINE.replace("006590,1,1,IST", "006591,11,2,IST"),
    ]);
    expect(result.games).toBe(2);
    expect(result.rounds).toEqual([1, 2]);
  });

  it("scores with a league's own weights when it has them", () => {
    const result = planStatImport({
      rows: rowsFrom(LINE),
      players: PLAYERS,
      existing: [],
      season: "E2026",
      weights: { ...OFFICIAL_WEIGHTS, foulsCommitted: 0 },
      winBonus: 1,
    });
    // Two fouls no longer charged, and no win bonus: PIR 5, 5.0 points.
    expect(result.creates[0]!.fields).toMatchObject({
      pir: 5,
      fantasy_pts: 50,
    });
  });

  it("keeps a game under the season it was imported for", () => {
    // `game_code` is unique *within a season* — E2025 and E2026 both have a
    // game 1 — so the season is part of the key and not decoration.
    const result = planStatImport({
      rows: rowsFrom(LINE),
      players: PLAYERS,
      existing: [storedFrom(LINE, "s1", { season: "E2025" })],
      season: "E2026",
    });
    expect(result.creates).toHaveLength(1);
    expect(result.unchanged).toBe(0);
  });
});

describe("describeStatPlan", () => {
  it("says nothing to store when there is nothing", () => {
    expect(describeStatPlan(plan([]))).toBe("Nothing to store.");
  });

  it("counts new lines, corrections and rounds", () => {
    const result = plan([LINE, LINE.replace("006590,1,1,", "006590,11,2,")]);
    expect(describeStatPlan(result)).toBe(
      "2 new game lines — 2 games across rounds 1–2.",
    );
  });

  it("names a single round singularly", () => {
    expect(describeStatPlan(plan([LINE]))).toBe(
      "1 new game line — 1 game in round 1.",
    );
  });

  it("mentions what it will leave alone", () => {
    const result = plan(
      [LINE, LINE.replace("006590,1,1,", "006590,11,2,")],
      [storedFrom(LINE)],
    );
    expect(describeStatPlan(result)).toBe(
      "1 new game line, 1 already stored — 2 games across rounds 1–2.",
    );
  });
});
