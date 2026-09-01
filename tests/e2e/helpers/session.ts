import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import type { BrowserContext } from "@playwright/test";
import PocketBase from "pocketbase";

import { parseServerEnv } from "../../../src/lib/config/schema";

/**
 * Signing in for E2E, without Google.
 *
 * Completing a real Google login in a test is not on: it needs somebody's
 * actual account, and automating a third-party consent screen is fragile. But
 * everything *behind* the login still needs testing, so instead of the OAuth
 * dance these helpers mint a genuine PocketBase token with the superuser's
 * `impersonate` and drop it into the browser's session cookie.
 *
 * The token is real, so `getSession()` verifies it against PocketBase exactly as
 * it would a token from Google — nothing about the session layer is stubbed. All
 * that is skipped is the trip to Google.
 *
 * Requires a running PocketBase and superuser credentials, which is why E2E is
 * local-first (see playwright.config.ts).
 */

/**
 * Playwright does not load `.env`, so read it here and let real environment
 * variables win. Parsing goes through the app's own schema, so the tests cannot
 * drift from what the app requires.
 */
function loadEnv(): ReturnType<typeof parseServerEnv> {
  let fileValues: Record<string, string> = {};
  try {
    const text = readFileSync(resolve(process.cwd(), ".env"), "utf8");
    fileValues = Object.fromEntries(
      text
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line && !line.startsWith("#") && line.includes("="))
        .map((line) => [
          line.slice(0, line.indexOf("=")),
          line.slice(line.indexOf("=") + 1),
        ]),
    );
  } catch {
    // No .env — fall through to process.env alone.
  }
  return parseServerEnv({ ...fileValues, ...process.env });
}

const env = loadEnv();

export type TestUser = {
  id: string;
  email: string;
  name: string;
  token: string;
};

/** Everything created through these helpers, so a spec can clean up after itself. */
const created: { users: string[]; leagues: string[]; players: string[] } = {
  users: [],
  leagues: [],
  players: [],
};

async function superuser(): Promise<PocketBase> {
  const pb = new PocketBase(env.PB_INTERNAL_URL);
  await pb
    .collection("_superusers")
    .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);
  return pb;
}

/**
 * A throwaway user with a real, impersonated auth token.
 *
 * `label` only has to be unique within a spec; a timestamp and random suffix
 * keep parallel workers and repeat runs from colliding on the email.
 */
export async function createTestUser(label: string): Promise<TestUser> {
  const pb = await superuser();
  const unique = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const email = `${label}.${unique}@e2e.invalid`;
  const password = `e2e-password-${unique}`;

  const record = await pb.collection("users").create(
    {
      email,
      password,
      passwordConfirm: password,
      name: label,
      verified: true,
    },
    { requestKey: null },
  );
  created.users.push(record.id);

  // 30 minutes: comfortably longer than any spec, short enough to be harmless.
  const impersonated = await pb
    .collection("users")
    .impersonate(record.id, 1800, { requestKey: null });

  return {
    id: record.id,
    email,
    name: label,
    token: impersonated.authStore.token,
  };
}

/** Put a user's session cookie in the browser, as the callback route would. */
export async function signIn(
  context: BrowserContext,
  user: TestUser,
): Promise<void> {
  await context.addCookies([
    {
      name: env.SESSION_COOKIE_NAME,
      value: user.token,
      // `localhost`, matching the baseURL and the registered OAuth origin.
      domain: "localhost",
      path: "/",
      httpOnly: true,
      sameSite: "Lax",
    },
  ]);
}

/** Read a league's invite code straight from the database. */
export async function inviteCodeOf(leagueId: string): Promise<string> {
  const pb = await superuser();
  const league = await pb
    .collection("leagues")
    .getOne(leagueId, { requestKey: null });
  return league.invite_code as string;
}

/**
 * A league owned by someone else entirely — for access-control tests.
 *
 * `withMembership: false` simulates the exact partial state `createLeague`
 * guards against: the league record written, its commissioner's membership lost.
 */
export async function createLeagueFor(
  user: TestUser,
  name: string,
  { withMembership = true }: { withMembership?: boolean } = {},
): Promise<{ id: string; code: string }> {
  const pb = await superuser();
  const { generateInviteCode } =
    await import("../../../src/lib/leagues/invite-code");
  const code = generateInviteCode();
  const league = await pb.collection("leagues").create(
    {
      name,
      season: "2026-27",
      commissioner: user.id,
      invite_code: code,
      settings: { roster_template: { G: 5, F: 5, C: 3 }, max_members: 12 },
      status: "setup",
    },
    { requestKey: null },
  );
  created.leagues.push(league.id);
  if (withMembership) {
    await pb
      .collection("league_members")
      .create(
        { league: league.id, user: user.id, team_name: "" },
        { requestKey: null },
      );
  }
  return { id: league.id, code };
}

/**
 * Add somebody to a league behind the UI's back.
 *
 * Used to make a change happen that the browser under test did not cause, which
 * is the only honest way to prove the lobby's realtime subscription: if the
 * watching page updates, it updated because PocketBase told it to.
 */
export async function addMemberTo(
  leagueId: string,
  user: TestUser,
  teamName = "",
): Promise<string> {
  const pb = await superuser();
  const record = await pb
    .collection("league_members")
    .create(
      { league: leagueId, user: user.id, team_name: teamName },
      { requestKey: null },
    );
  return record.id;
}

/**
 * Delete everything these helpers created. Leagues go first: their memberships
 * cascade, so deleting the users afterwards has nothing left to trip over.
 */
/**
 * A player in the pool.
 *
 * The pool is app-global rather than per-league, so a spec that asserted on
 * whatever `npm run rosters:sync` last ingested would pass or fail depending on
 * whether anyone had run it. This plants its own player and cleans it up.
 */
/**
 * A club code unique to this worker process.
 *
 * The player pool is app-global, so a shared "ZZZ" test club meant one spec's
 * cleanup deleted another spec's planted player mid-test, in parallel. Each
 * worker gets its own club and purges only that one.
 */
export const TEST_CLUB = `Z${Math.random().toString(36).slice(2, 5).toUpperCase()}`;

/** Grant a member the league's management powers, straight in the database. */
export async function grantManage(
  leagueId: string,
  user: TestUser,
): Promise<void> {
  const pb = await superuser();
  const rows = await pb.collection("league_members").getFullList({
    filter: `league = '${leagueId}' && user = '${user.id}'`,
    requestKey: null,
  });
  if (rows[0]) {
    await pb
      .collection("league_members")
      .update(rows[0].id, { can_manage: true }, { requestKey: null });
  }
}

/** Put the app-global roster authority back to its default. */
export async function resetRosterAuthority(): Promise<void> {
  const pb = await superuser();
  const rows = await pb
    .collection("app_settings")
    .getFullList({ requestKey: null });
  if (rows[0] && rows[0].roster_authority !== "api") {
    await pb
      .collection("app_settings")
      .update(rows[0].id, { roster_authority: "api" }, { requestKey: null });
  }
}

export async function createPlayer(
  label: string,
  over: Record<string, unknown> = {},
): Promise<{ id: string; name: string; club_code: string }> {
  const pb = await superuser();
  const unique = `${Date.now()}${Math.random().toString(36).slice(2, 7)}`;
  const record = await pb.collection("players").create(
    {
      // The unique suffix belongs in the DISPLAY name too, not just the match
      // key. The pool is app-global and Playwright runs the chromium and mobile
      // projects in parallel, so two workers planting "Locked, E2e" put two
      // identical rows on the same page and every locator hit a strict-mode
      // violation. Caught by exactly that failure.
      name: `${label} ${unique}, E2e`,
      name_normalized: `e2e ${label.toLowerCase()} ${unique}`,
      club_code: TEST_CLUB,
      club_name: "E2E Test Club",
      position: "G",
      status: "active",
      source: "api",
      dorsal: "99",
      ...over,
    },
    { requestKey: null },
  );
  created.players.push(record.id);
  return {
    id: record.id,
    name: record.name as string,
    club_code: record.club_code as string,
  };
}

export async function cleanupTestData(): Promise<void> {
  const pb = await superuser();

  // Every player in the test club goes, not just the ones `createPlayer`
  // tracked. A CSV import creates players this helper never saw, and they
  // linger into the next run — which is how a spec ended up asserting against
  // a previous run's leftovers.
  const strays = await pb.collection("players").getFullList({
    filter: `club_code = '${TEST_CLUB}'`,
    requestKey: null,
  });
  for (const stray of strays) {
    await pb
      .collection("players")
      .delete(stray.id, { requestKey: null })
      .catch(() => {});
  }

  // Picks reference players and members without cascading — losing a member
  // mid-draft must not tear a hole in the board — so the picks have to go
  // before the players do, and the drafts before the leagues.
  for (const id of created.leagues) {
    const drafts = await pb
      .collection("drafts")
      .getFullList({ filter: `league = '${id}'`, requestKey: null })
      .catch(() => []);
    for (const draft of drafts) {
      const picks = await pb
        .collection("picks")
        .getFullList({ filter: `draft = '${draft.id}'`, requestKey: null })
        .catch(() => []);
      for (const pick of picks) {
        await pb
          .collection("picks")
          .delete(pick.id, { requestKey: null })
          .catch(() => {});
      }
      await pb
        .collection("drafts")
        .delete(draft.id, { requestKey: null })
        .catch(() => {});
    }
  }
  for (const id of created.players) {
    await pb
      .collection("players")
      .delete(id, { requestKey: null })
      .catch(() => {});
  }
  for (const id of created.leagues) {
    await pb
      .collection("leagues")
      .delete(id, { requestKey: null })
      .catch(() => {});
  }
  for (const id of created.users) {
    await pb
      .collection("users")
      .delete(id, { requestKey: null })
      .catch(() => {});
  }
  created.leagues.length = 0;
  created.users.length = 0;
  created.players.length = 0;
}

/** Track a league the *app* created, so cleanup removes it too. */
export function trackLeague(id: string): void {
  created.leagues.push(id);
}
