import PocketBase from "pocketbase";

import { parseServerEnv } from "../../../src/lib/config/schema";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * Sweep **every** trace of a past E2E run, whoever made it.
 *
 * ## Why `cleanupTestData` was not enough
 *
 * That helper runs in `afterEach` and cleans what *this process* made: its own
 * `TEST_CLUB` (a random code minted per worker process at module load) and an
 * in-memory registry of the ids it created. Both are perfect for the run they
 * belong to and useless afterwards:
 *
 * - A **killed** run never reaches `afterEach`. The registry dies with the
 *   process, and the club code it was using is never generated again — so its
 *   players, leagues and users are unreachable by any later cleanup.
 * - The same is true of a crashed worker, a `Ctrl-C`, a failed `webServer`
 *   start, and a machine going to sleep mid-suite.
 *
 * That is not hypothetical: it reached **900 test players against 327 real
 * ones, and 213 leagues**, which is why the draft room's club filter offered
 * 195 clubs and the pool claimed 1,217 players. A polluted pool also makes
 * every pool render slower, which shows up as *flaky specs* — the count
 * dropped from 12 flakes to 10 on a clean database.
 *
 * ## What makes this sweep exact rather than a guess
 *
 * Two markers that no real row can carry:
 *
 * - **Users**: the e2e helper mints emails at `@e2e.invalid`. `.invalid` is
 *   reserved by RFC 2606 precisely so it can never be a real address, so this
 *   cannot match a human.
 * - **Players and fixtures**: `club_name` is the literal `"E2E Test Club"`.
 *   Deterministic, unlike the random `TEST_CLUB` *code*, which is exactly the
 *   thing a dead process takes with it.
 *
 * Leagues are reached through their commissioner being a test user, so a
 * league keeps no naming convention of its own to drift.
 *
 * ## Order
 *
 * The same order `deleteLeague` and `cleanupTestData` use, and for the same
 * reason: `picks.player` and `picks.member` are required relations that
 * PocketBase refuses to orphan, so boards go before the pool. Roster windows
 * and drafts before their league, because the cascade is what takes members,
 * chat and sheets with it.
 */

const TEST_EMAIL_DOMAIN = "e2e.invalid";
const TEST_CLUB_NAME = "E2E Test Club";

/** Playwright does not load `.env`; real environment variables still win. */
function env() {
  const file = resolve(process.cwd(), ".env");
  const fromFile: Record<string, string> = {};
  try {
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(line);
      if (!match) continue;
      fromFile[match[1]!] = match[2]!.replace(/^["']|["']$/g, "").trim();
    }
  } catch {
    // No `.env` is fine when the real environment already carries everything.
  }
  return parseServerEnv({ ...fromFile, ...process.env });
}

export type SweepResult = {
  readonly picks: number;
  readonly leagues: number;
  readonly players: number;
  readonly users: number;
  readonly fixtures: number;
};

export async function sweepTestData(): Promise<SweepResult> {
  const config = env();
  const pb = new PocketBase(config.PB_INTERNAL_URL);
  await pb
    .collection("_superusers")
    .authWithPassword(config.PB_SUPERUSER_EMAIL, config.PB_SUPERUSER_PASSWORD);

  const all = (collection: string, filter?: string) =>
    pb
      .collection(collection)
      .getFullList({ ...(filter ? { filter } : {}), requestKey: null })
      .catch(() => [] as { id: string }[]);
  const drop = (collection: string, id: string) =>
    pb
      .collection(collection)
      .delete(id, { requestKey: null })
      .catch(() => {});

  const result = { picks: 0, leagues: 0, players: 0, users: 0, fixtures: 0 };

  // 1. Boards first: a pick pins its player and its member.
  const picks = await all("picks", `player.club_name = "${TEST_CLUB_NAME}"`);
  for (const pick of picks) {
    await drop("picks", pick.id);
    result.picks += 1;
  }

  // 2. Leagues whose commissioner is a test user, windows and drafts first.
  const users = await all("users", `email ~ "@${TEST_EMAIL_DOMAIN}"`);
  const testUserIds = new Set(users.map((user) => user.id));
  const leagues = await all("leagues");
  for (const league of leagues as { id: string; commissioner?: string }[]) {
    if (!league.commissioner || !testUserIds.has(league.commissioner)) continue;
    for (const collection of ["roster_memberships", "drafts"]) {
      for (const row of await all(collection, `league = '${league.id}'`)) {
        await drop(collection, row.id);
      }
    }
    await drop("leagues", league.id);
    result.leagues += 1;
  }

  // 3. The pool. Read before deleting, because the club *codes* these rows
  //    carry are the only way to find the fixtures that reference them:
  //    `fixtures` stores club codes and no club name, and the test code is a
  //    random `Z???` that a dead process took with it. Pattern-matching it
  //    would be unsafe — `ZAL` is Zalgiris.
  const testPlayers = (await all(
    "players",
    `club_name = "${TEST_CLUB_NAME}"`,
  )) as { id: string; club_code?: string }[];
  const testClubs = new Set(
    testPlayers.map((player) => player.club_code).filter(Boolean),
  );
  for (const player of testPlayers) {
    await drop("players", player.id);
    result.players += 1;
  }

  // 4. Fixtures that name one of those clubs. Exact, rather than guessed from
  //    the code's shape.
  if (testClubs.size > 0) {
    const fixtures = (await all("fixtures")) as {
      id: string;
      local_club?: string;
      road_club?: string;
    }[];
    for (const fixture of fixtures) {
      const mine =
        (fixture.local_club && testClubs.has(fixture.local_club)) ||
        (fixture.road_club && testClubs.has(fixture.road_club));
      if (!mine) continue;
      await drop("fixtures", fixture.id);
      result.fixtures += 1;
    }
  }

  // 5. The people last: a membership or a league still pointing at one would
  //    have refused the delete above.
  for (const user of users) {
    await drop("users", user.id);
    result.users += 1;
  }

  return result;
}

/** One line, only when there was something to say. */
export function describeSweep(
  result: SweepResult,
  when: string,
): string | null {
  const parts = Object.entries(result)
    .filter(([, count]) => count > 0)
    .map(([what, count]) => `${count} ${what}`);
  return parts.length === 0 ? null : `e2e sweep ${when}: ${parts.join(", ")}`;
}
