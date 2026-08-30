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
const created: { users: string[]; leagues: string[] } = { users: [], leagues: [] };

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
  const { generateInviteCode } = await import(
    "../../../src/lib/leagues/invite-code"
  );
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
    await pb.collection("league_members").create(
      { league: league.id, user: user.id, team_name: "" },
      { requestKey: null },
    );
  }
  return { id: league.id, code };
}

/**
 * Delete everything these helpers created. Leagues go first: their memberships
 * cascade, so deleting the users afterwards has nothing left to trip over.
 */
export async function cleanupTestData(): Promise<void> {
  const pb = await superuser();
  for (const id of created.leagues) {
    await pb.collection("leagues").delete(id, { requestKey: null }).catch(() => {});
  }
  for (const id of created.users) {
    await pb.collection("users").delete(id, { requestKey: null }).catch(() => {});
  }
  created.leagues.length = 0;
  created.users.length = 0;
}

/** Track a league the *app* created, so cleanup removes it too. */
export function trackLeague(id: string): void {
  created.leagues.push(id);
}
