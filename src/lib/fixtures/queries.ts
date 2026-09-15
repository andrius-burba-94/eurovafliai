import "server-only";

import { createUserClient } from "@/lib/pb/server";

import {
  nextFixturesByClub,
  roundFixturesByClub,
} from "./schedule";
import { readStoredFixtures, scheduleRowsFrom } from "./store";
import type { PlayerFixture } from "./types";

/**
 * Fixtures for a page, read with the viewer's token — slice 10.7.
 *
 * Both functions return a map keyed by club code, because that is the join a
 * roster actually needs: thirteen players from up to thirteen clubs, and one
 * read of the season's four hundred rows rather than thirteen.
 *
 * An empty map is a normal answer, not an error. Before the first ingest pass of
 * a season there are no fixtures at all, and every surface renders no fixture
 * line rather than a placeholder — which is the same behaviour these pages had
 * for the eight days between 10.5 and 10.7.
 */

type FixtureMap = ReadonlyMap<string, PlayerFixture>;

const EMPTY: FixtureMap = new Map();

async function seasonRows(season: string, token: string) {
  const pb = createUserClient(token);
  return scheduleRowsFrom(await readStoredFixtures(pb, season));
}

/** Each club's next unplayed game — what a current roster is about. */
export async function readNextFixtures(
  season: string,
  token: string,
): Promise<FixtureMap> {
  try {
    return nextFixturesByClub(await seasonRows(season, token));
  } catch {
    // A roster that cannot read the schedule is still a roster. This is one
    // line on a block, and failing the page for it would trade the thirteen
    // players somebody came to see for a fixture nobody had before today.
    return EMPTY;
  }
}

/** Each club's game in one round — what a lineup for that round is about. */
export async function readRoundFixtures(
  season: string,
  round: number,
  token: string,
): Promise<FixtureMap> {
  try {
    return roundFixturesByClub(await seasonRows(season, token), round);
  } catch {
    return EMPTY;
  }
}
