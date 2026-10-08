import { describe, expect, it } from "vitest";

import { parseStatCsv } from "./csv";
import { toStatFields, type ExistingStatRow } from "./plan";
import { planStarterBackfill } from "./starters";

const HEADER =
  "personCode,gameCode,round,clubCode,teamScore,opponentScore,points," +
  "fieldGoalsMade2,fieldGoalsAttempted2,fieldGoalsMade3,fieldGoalsAttempted3," +
  "freeThrowsMade,freeThrowsAttempted,totalRebounds,assistances,steals," +
  "turnovers,blocksFavour,blocksAgainst,foulsCommited,foulsReceived";
const LINE = "006590,1,1,IST,85,78,7,3,7,0,4,1,1,3,2,0,0,0,1,2,2";

const row = (started?: boolean) => {
  const parsed = parseStatCsv([HEADER, LINE].join("\n")).rows[0]!;
  return started === undefined ? parsed : { ...parsed, started };
};
const players = [{ id: "p1", personCode: "006590", name: "Beaubois" }];
const stored = (started: ExistingStatRow["started"] | undefined): ExistingStatRow =>
  ({ id: "s1", ...toStatFields(row(), { playerId: "p1", season: "E2026" }), started }) as ExistingStatRow;

describe("planStarterBackfill", () => {
  it("fills in an unknown start", () => {
    expect(planStarterBackfill({ rows: [row(true)], players, existing: [stored("")] })).toEqual([
      { id: "s1", started: "yes" },
    ]);
  });

  it("reads a row stored before the field existed as unknown", () => {
    expect(planStarterBackfill({ rows: [row(false)], players, existing: [stored(undefined)] })).toEqual([
      { id: "s1", started: "no" },
    ]);
  });

  it("writes nothing on a second run", () => {
    expect(planStarterBackfill({ rows: [row(true)], players, existing: [stored("yes")] })).toEqual([]);
  });

  it("never writes onto a stored line from a different club or round", () => {
    const elsewhere = { ...stored(""), club_code: "OLY" } as ExistingStatRow;
    const earlier = { ...stored(""), round: 2 } as ExistingStatRow;
    expect(planStarterBackfill({ rows: [row(true)], players, existing: [elsewhere] })).toEqual([]);
    expect(planStarterBackfill({ rows: [row(true)], players, existing: [earlier] })).toEqual([]);
  });

  it("skips a side the feed could not read, a player the pool lacks and a row never stored", () => {
    expect(planStarterBackfill({ rows: [row()], players, existing: [stored("")] })).toEqual([]);
    expect(planStarterBackfill({ rows: [row(true)], players: [], existing: [stored("")] })).toEqual([]);
    expect(planStarterBackfill({ rows: [row(true)], players, existing: [] })).toEqual([]);
  });
});
