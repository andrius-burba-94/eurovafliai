/**
 * Prove that a FIRST-TIME OAuth2 sign-in can still create its `users` record
 * now that public sign-up is closed.
 *
 * This is the one invariant in the auth slice that cannot be checked by reading
 * a rule: `users.createRule` is `@request.context = "oauth2"`, and the claim is
 * that PocketBase evaluates that rule in the `oauth2` context while completing
 * a sign-in — so a brand-new member is allowed in, and a direct API POST is not.
 * Get it wrong and existing members keep working while every new member is
 * refused, which surfaces on draft night and nowhere earlier.
 *
 * A real Google account cannot be scripted, so this stands up a local OIDC
 * issuer, registers it as a temporary `oidc` provider, and completes the manual
 * code flow against it. PocketBase takes exactly the same internal path it takes
 * for Google: exchange code → fetch userinfo → find no linked record → create
 * one, subject to createRule.
 *
 * It runs three cases, because "it worked" alone would not prove the rule is
 * what made it work:
 *
 *   A. rule = '@request.context = "oauth2"'  → sign-up ALLOWED
 *   B. rule = null (superusers only)         → sign-up REFUSED
 *   C. rule restored                         → sign-up ALLOWED again
 *
 * B is the case that would have shipped if `createRule: null` had looked
 * plausible enough. It is left in as a regression guard.
 *
 *   npm run pb:verify:oauth2      # with PocketBase already running
 *
 * LOCALHOST ONLY — it mutates collection config and creates users, then puts
 * everything back in a finally block.
 *
 * One trap this script has to clean up after itself: PocketBase's automigrate
 * writes a migration file whenever collection config changes through the API,
 * so a run would otherwise litter pb/pb_migrations with files capturing the
 * harness's own intermediate states — including case B's `createRule: null`,
 * which is the one state that must never reach production. Any file that
 * appears during a run is deleted again below. PocketBase keeps a history row
 * for it, which is harmless — it boots clean and pb:verify passes either way —
 * and `./pb/pocketbase migrate history-sync` tidies it if you care.
 */
import { readdirSync, rmSync } from "node:fs";
import { createServer } from "node:http";
import { join } from "node:path";

import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema.ts";

const env = parseServerEnv(process.env);
const url = env.PB_INTERNAL_URL;

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(
    `Refusing to run: this script rewrites collection config, and PB_INTERNAL_URL is ${url}.\n` +
      "It is only for a local PocketBase.",
  );
  process.exit(2);
}

const OAUTH2_RULE = '@request.context = "oauth2"';
const PROVIDER = "oidc";

let failures = 0;
const check = (condition, message) => {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${message}`);
};

/**
 * The fake identity provider. Only two endpoints matter to PocketBase in the
 * manual code flow: the token exchange, and userinfo. `sub` is what makes an
 * identity "never seen before", so each case gets a fresh one.
 */
let currentSubject = null;
const issuer = createServer((req, res) => {
  const json = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };

  if (req.url.startsWith("/token")) {
    // Deliberately no id_token, so PocketBase must call /userinfo. Returning a
    // signed JWT here would test our own signing, not PocketBase's create path.
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () =>
      json(200, {
        access_token: `fake-access-${currentSubject}`,
        token_type: "Bearer",
        expires_in: 3600,
      }),
    );
    return;
  }

  if (req.url.startsWith("/userinfo")) {
    return json(200, {
      sub: currentSubject,
      email: `${currentSubject}@oidc.invalid`,
      email_verified: true,
      name: "First Timer",
    });
  }

  return json(404, { error: "not_found" });
});

await new Promise((resolve) => issuer.listen(0, "127.0.0.1", resolve));
const issuerOrigin = `http://127.0.0.1:${issuer.address().port}`;

const su = new PocketBase(url);
await su
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

// Automigrate will write files here as a side effect of the API calls below.
const MIGRATIONS_DIR = "pb/pb_migrations";
const migrationsBefore = new Set(readdirSync(MIGRATIONS_DIR));

const before = await su.collections.getOne("users", { requestKey: null });
const snapshot = {
  createRule: before.createRule,
  oauth2: JSON.parse(JSON.stringify(before.oauth2)),
};
const createdUserIds = [];

const setRule = (createRule) =>
  su.collections.update(before.id, { createRule }, { requestKey: null });

/** Run one full sign-in for a never-before-seen identity. */
const attemptSignIn = async (subject) => {
  currentSubject = subject;
  const client = new PocketBase(url);
  try {
    const auth = await client
      .collection("users")
      .authWithOAuth2Code(
        PROVIDER,
        `code-${subject}`,
        `verifier-${subject}`,
        `${issuerOrigin}/callback`,
        {},
        { requestKey: null },
      );
    if (auth?.record?.id) createdUserIds.push(auth.record.id);
    return { ok: true, record: auth.record };
  } catch (error) {
    return { ok: false, status: error?.status, message: error?.message };
  }
};

try {
  // Register the throwaway provider alongside google, leaving google untouched.
  await su.collections.update(
    before.id,
    {
      oauth2: {
        enabled: true,
        providers: [
          ...(snapshot.oauth2.providers ?? []).filter(
            (p) => p.name !== PROVIDER,
          ),
          {
            name: PROVIDER,
            clientId: "harness-client-id",
            clientSecret: "harness-client-secret",
            authURL: `${issuerOrigin}/authorize`,
            tokenURL: `${issuerOrigin}/token`,
            userInfoURL: `${issuerOrigin}/userinfo`,
            displayName: "Local harness",
            pkce: true,
          },
        ],
      },
    },
    { requestKey: null },
  );

  const stamp = Date.now();

  // --- A: the shipped rule lets a brand-new identity in --------------------
  await setRule(OAUTH2_RULE);
  const first = await attemptSignIn(`newcomer-a-${stamp}`);
  check(
    first.ok,
    "a first-time OAuth2 sign-in creates its user " +
      (first.ok ? "" : `— refused: ${first.status} ${first.message}`),
  );
  check(
    first.record?.email === `newcomer-a-${stamp}@oidc.invalid`,
    "the created record carries the identity's email",
  );

  // A returning identity takes the link, not the create path. Proves the test
  // above was really exercising creation.
  const returning = await attemptSignIn(`newcomer-a-${stamp}`);
  check(
    returning.ok && returning.record?.id === first.record?.id,
    "a returning identity re-authenticates to the same record",
  );

  // --- B: createRule: null would have broken sign-up -----------------------
  await setRule(null);
  const locked = await attemptSignIn(`newcomer-b-${stamp}`);
  check(
    !locked.ok,
    "with createRule null, a first-time sign-in is REFUSED " +
      "(this is why the rule is not null)",
  );

  // --- C: restoring the rule restores sign-up ------------------------------
  await setRule(OAUTH2_RULE);
  const third = await attemptSignIn(`newcomer-c-${stamp}`);
  check(third.ok, "restoring the rule lets a new identity in again");
} finally {
  for (const id of createdUserIds) {
    await su
      .collection("users")
      .delete(id, { requestKey: null })
      .catch(() => {});
  }
  // Put the collection back exactly as it was found, provider list included.
  await su.collections
    .update(
      before.id,
      { createRule: snapshot.createRule, oauth2: snapshot.oauth2 },
      { requestKey: null },
    )
    .catch((error) => {
      console.error(
        "\n!! Could not restore the users collection. Restore by hand:\n",
        JSON.stringify(snapshot, null, 2),
        error,
      );
      failures++;
    });
  // Drop any migration automigrate generated from this run's own writes. These
  // snapshot harness states (case B sets `createRule: null`) and applying one
  // would close sign-up to superusers only — exactly the outage this script
  // exists to rule out.
  const generated = readdirSync(MIGRATIONS_DIR).filter(
    (f) => !migrationsBefore.has(f),
  );
  for (const file of generated) {
    rmSync(join(MIGRATIONS_DIR, file));
    console.log(`      (removed automigrate leftover ${file})`);
  }
  if (generated.length > 0) {
    // Cosmetic only: PocketBase boots fine and pb:verify passes with the row
    // still there (checked). The file was the dangerous part, and it is gone.
    console.log(
      "      A migration-history row for it remains, which is harmless. To tidy:\n" +
        "      ./pb/pocketbase migrate history-sync --dir=pb/pb_data --migrationsDir=pb/pb_migrations",
    );
  }

  issuer.close();
}

const after = await su.collections.getOne("users", { requestKey: null });
check(
  after.createRule === snapshot.createRule,
  "the users createRule was left as it was found",
);
check(
  !(after.oauth2.providers ?? []).some((p) => p.name === PROVIDER),
  "the throwaway provider was removed",
);

console.log(
  failures === 0
    ? "\nFirst-time OAuth2 sign-up works with public sign-up closed."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
