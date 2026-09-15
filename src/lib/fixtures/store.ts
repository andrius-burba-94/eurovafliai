/**
 * Storing the schedule — slice 10.7.
 *
 * Framework-free, like the news store and the pick pipeline: the worker runs
 * this and a worker cannot import a `"use server"` module. Every judgement
 * about what a fixture *means* is in `schedule.ts`; this file only writes rows.
 *
 * ## Failure recovery
 *
 * The pass is an upsert keyed on `unique(season, game_code)`, and that index is
 * the physical backstop rather than a tidiness measure — PocketBase has no
 * transactions and a first pass writes about four hundred rows. Three
 * properties make a half-finished pass safe:
 *
 * - **The plan is a comparison, not a queue.** It is "what does the feed say
 *   that the database does not", recomputed from scratch every pass. A pass
 *   that dies after two hundred rows leaves two hundred stored, and the next
 *   pass — fifteen minutes later, unprompted — plans exactly the remainder.
 * - **A lost race is an expected outcome, not a failure.** A create that comes
 *   back `validation_not_unique` means a concurrent pass stored the same game;
 *   the row is read back and updated, which is the state we wanted anyway.
 * - **Nothing is ever deleted.** A game code that disappears from the feed —
 *   which happens when a fixture is rescheduled and renumbered — leaves a stale
 *   row rather than taking a real one with it. `nextFixture` reads `played`, and
 *   a stale unplayed row with a kickoff in the past sorts behind nothing, so the
 *   cost is a row, not a wrong answer.
 */

import type PocketBase from "pocketbase";

import type { ScheduleRow } from "./schedule";

export type FixturePb = Pick<PocketBase, "collection">;

/** A fixture as the collection stores it. */
export type FixtureRecord = {
  readonly id: string;
  readonly season: string;
  readonly game_code: number;
  readonly round: number;
  readonly phase: string;
  readonly local_club: string;
  readonly road_club: string;
  readonly played?: boolean;
  readonly local_score?: number;
  readonly road_score?: number;
  readonly utc_date?: string;
};

export type FixtureWrite = {
  readonly season: string;
  readonly game_code: number;
  readonly round: number;
  readonly phase: string;
  readonly local_club: string;
  readonly road_club: string;
  readonly played: boolean;
  readonly local_score: number;
  readonly road_score: number;
  readonly utc_date: string;
};

export type AppliedFixtures = {
  created: number;
  updated: number;
  unchanged: number;
  failures: string[];
};

/** Every stored fixture for one season — about four hundred rows. */
export async function readStoredFixtures(
  pb: FixturePb,
  season: string,
): Promise<FixtureRecord[]> {
  return pb.collection("fixtures").getFullList<FixtureRecord>({
    filter: `season = "${season}"`,
    requestKey: null,
  });
}

/**
 * What the schedule rows read by the feed look like as stored fields.
 *
 * A game the feed has not timed yet stores an empty string rather than a null,
 * because that is what PocketBase gives back for an unset text field and
 * "unknown" has to compare equal to itself across a round trip.
 */
export function asFixtureFields(
  season: string,
  game: {
    gameCode: number;
    round: number;
    phase: string;
    played: boolean;
    localClub: string;
    roadClub: string;
    localScore: number;
    roadScore: number;
    utcDate: string | null;
  },
): FixtureWrite {
  return {
    season,
    game_code: game.gameCode,
    round: game.round,
    phase: game.phase,
    local_club: game.localClub,
    road_club: game.roadClub,
    played: game.played,
    local_score: game.localScore,
    road_score: game.roadScore,
    utc_date: game.utcDate ?? "",
  };
}

/**
 * Is the stored row already saying this?
 *
 * Compared field by field rather than by a hash, so the answer says *what*
 * differs when a test disagrees. The comparison is why a quiet night is a
 * zero-write pass: between game nights the feed returns four hundred rows that
 * all match, and rewriting them would churn `updated` on every row every quarter
 * of an hour — which is also the timestamp the app would have to stop trusting.
 */
export function sameFixture(
  stored: FixtureRecord,
  fields: FixtureWrite,
): boolean {
  return (
    stored.round === fields.round &&
    stored.phase === fields.phase &&
    stored.local_club === fields.local_club &&
    stored.road_club === fields.road_club &&
    (stored.played ?? false) === fields.played &&
    (stored.local_score ?? 0) === fields.local_score &&
    (stored.road_score ?? 0) === fields.road_score &&
    (stored.utc_date ?? "") === fields.utc_date
  );
}

function isUnique(error: unknown): boolean {
  const data = (
    error as { response?: { data?: Record<string, { code?: string }> } }
  )?.response?.data;
  return Object.values(data ?? {}).some(
    (field) => field?.code === "validation_not_unique",
  );
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Store a season's schedule, writing only what changed.
 *
 * Oldest game first, so a pass that dies halfway leaves a prefix of the season
 * rather than a scatter through it — the same ordering argument the box-score
 * backfill makes.
 */
export async function upsertFixtures(
  pb: FixturePb,
  season: string,
  games: readonly {
    gameCode: number;
    round: number;
    phase: string;
    played: boolean;
    localClub: string;
    roadClub: string;
    localScore: number;
    roadScore: number;
    utcDate: string | null;
  }[],
): Promise<AppliedFixtures> {
  const applied: AppliedFixtures = {
    created: 0,
    updated: 0,
    unchanged: 0,
    failures: [],
  };

  const stored = await readStoredFixtures(pb, season);
  const byCode = new Map(stored.map((row) => [row.game_code, row]));

  const ordered = [...games].sort((a, b) => a.gameCode - b.gameCode);

  for (const game of ordered) {
    const fields = asFixtureFields(season, game);
    const existing = byCode.get(game.gameCode);

    if (existing) {
      if (sameFixture(existing, fields)) {
        applied.unchanged += 1;
        continue;
      }
      try {
        await pb
          .collection("fixtures")
          .update(existing.id, fields, { requestKey: null });
        applied.updated += 1;
      } catch (error) {
        applied.failures.push(
          `Could not update game ${game.gameCode}: ${describe(error)}`,
        );
      }
      continue;
    }

    try {
      await pb.collection("fixtures").create(fields, { requestKey: null });
      applied.created += 1;
    } catch (error) {
      if (!isUnique(error)) {
        applied.failures.push(
          `Could not store game ${game.gameCode}: ${describe(error)}`,
        );
        continue;
      }
      // Another pass stored this game between our read and our write. Read it
      // back and correct it if it says something else — the index did its job,
      // and the row we wanted is there.
      const [raced] = await pb
        .collection("fixtures")
        .getFullList<FixtureRecord>({
          filter: `season = "${season}" && game_code = ${game.gameCode}`,
          requestKey: null,
        });
      if (!raced) {
        applied.failures.push(
          `Game ${game.gameCode} was refused as a duplicate and then could not be found.`,
        );
        continue;
      }
      if (sameFixture(raced, fields)) {
        applied.unchanged += 1;
        continue;
      }
      try {
        await pb
          .collection("fixtures")
          .update(raced.id, fields, { requestKey: null });
        applied.updated += 1;
      } catch (error) {
        applied.failures.push(
          `Could not update game ${game.gameCode} after a duplicate: ${describe(error)}`,
        );
      }
    }
  }

  return applied;
}

/**
 * The season's schedule as the pure module reads it.
 *
 * The one translation between a stored row and a `ScheduleRow`, so a page and
 * the worker cannot disagree about what an unset score means.
 */
export function scheduleRowsFrom(
  stored: readonly FixtureRecord[],
): ScheduleRow[] {
  return stored.map((row) => ({
    gameCode: row.game_code,
    round: row.round,
    played: row.played ?? false,
    localClub: row.local_club,
    roadClub: row.road_club,
    localScore: row.local_score ?? 0,
    roadScore: row.road_score ?? 0,
    utcDate: row.utc_date ? row.utc_date : null,
  }));
}
