/**
 * Verify the PocketBase API rules and unique indexes actually behave.
 *
 * The rules in pb/pb_migrations are load-bearing security, not decoration: they
 * are what stops one league's members from reading another league. That claim
 * is only worth making if something checks it, and it cannot be unit-tested —
 * it needs a live PocketBase. So: run this after any migration that touches
 * fields, indexes or rules.
 *
 *   npm run pb:verify        # with `npm run dev` (or pb:serve) already running
 *
 * It creates throwaway users, leagues and memberships, asserts the invariants,
 * and deletes everything it made. LOCALHOST ONLY — it refuses to run against a
 * remote PocketBase, because it writes.
 */
import PocketBase from "pocketbase";

import { parseServerEnv } from "../src/lib/config/schema.ts";

const env = parseServerEnv(process.env);
const url = env.PB_INTERNAL_URL;

if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:|\/|$)/.test(url)) {
  console.error(
    `Refusing to run: this script writes records, and PB_INTERNAL_URL is ${url}.\n` +
      "It is only for a local PocketBase.",
  );
  process.exit(2);
}

let failures = 0;
const check = (condition, message) => {
  if (!condition) failures++;
  console.log(`${condition ? "PASS" : "FAIL"}  ${message}`);
};

const stamp = Date.now();
const created = { users: [], leagues: [], members: [] };

const su = new PocketBase(url);
await su
  .collection("_superusers")
  .authWithPassword(env.PB_SUPERUSER_EMAIL, env.PB_SUPERUSER_PASSWORD);

const makeUser = async (label) => {
  // No password: `passwordAuth` is disabled on `users`, and these clients
  // authenticate by superuser impersonation instead. PocketBase still requires
  // the field on an auth record, so it gets a random one nothing ever uses.
  const throwaway = crypto.randomUUID();
  const user = await su.collection("users").create(
    {
      email: `${label}.${stamp}@verify.invalid`,
      password: throwaway,
      passwordConfirm: throwaway,
      name: label,
      verified: true,
    },
    { requestKey: null },
  );
  created.users.push(user.id);
  return user;
};

const makeLeague = async (name, code, commissioner) => {
  const league = await su.collection("leagues").create(
    {
      name,
      season: "2026-27",
      commissioner,
      invite_code: code,
      settings: { roster_template: { G: 5, F: 5, C: 3 } },
      status: "setup",
    },
    { requestKey: null },
  );
  created.leagues.push(league.id);
  return league;
};

const makeMember = async (league, user, teamName) => {
  const member = await su
    .collection("league_members")
    .create({ league, user, team_name: teamName }, { requestKey: null });
  created.members.push(member.id);
  return member;
};

// Authenticate as a real (non-superuser) user WITHOUT password auth: a
// superuser mints a short-lived token for the record and the SDK hands back a
// client already carrying it. This is the only way to exercise the read rules
// as an end user now that `passwordAuth` is off — and it is closer to
// production anyway, where every session token comes from Google.
const asUser = async (userId) => su.collection("users").impersonate(userId, 600);

const rejects = async (fn) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

const listCount = async (client, collection) =>
  (await client.collection(collection).getFullList({ requestKey: null })).length;

try {
  // --- schema shape ---------------------------------------------------------
  const collections = await su.collections.getFullList({ requestKey: null });
  const byName = Object.fromEntries(collections.map((c) => [c.name, c]));

  check(!!byName.leagues, "leagues collection exists");
  check(!!byName.league_members, "league_members collection exists");
  check(
    byName.leagues.createRule === null &&
      byName.leagues.updateRule === null &&
      byName.leagues.deleteRule === null,
    "leagues writes are superuser-only",
  );
  check(
    byName.league_members.createRule === null &&
      byName.league_members.updateRule === null &&
      byName.league_members.deleteRule === null,
    "league_members writes are superuser-only",
  );
  check(byName.users.authRule === 'id != ""', "users authRule is 'id != \"\"'");
  // Public sign-up is closed. The rule is NOT null on purpose: PocketBase
  // creates the `users` record for a first-time Google sign-in through an
  // internal record-create that is subject to createRule, so null would let
  // existing members in and lock every new member out. `@request.context`
  // (v0.22.0+) distinguishes the two — `oauth2` is the sign-in path, `default`
  // is a direct API POST.
  check(
    byName.users.createRule === '@request.context = "oauth2"',
    "public sign-up is closed (only the oauth2 context may create a user)",
  );
  check(
    byName.users.passwordAuth?.enabled === false,
    "password auth is disabled on users (Google is the only door)",
  );
  // Conditional: the Google provider is only configured when the credentials
  // were present when the migration was applied, so only assert it when this
  // environment actually has them.
  if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
    check(byName.users.oauth2.enabled === true, "users OAuth2 is enabled");
    check(
      byName.users.oauth2.providers.some((p) => p.name === "google"),
      "the google OAuth2 provider is configured",
    );
  } else {
    console.log(
      "SKIP  Google OAuth2 checks (GOOGLE_CLIENT_ID / _SECRET not in this environment)",
    );
  }
  check(
    byName.leagues.indexes.some((i) => /UNIQUE.*invite_code/.test(i)),
    "unique index on leagues.invite_code",
  );
  check(
    byName.league_members.indexes.some((i) =>
      /UNIQUE.*`league`.*`user`/.test(i),
    ),
    "unique index on league_members(league, user)",
  );
  const draftPosition = byName.league_members.fields.find(
    (f) => f.name === "draft_position",
  );
  check(
    draftPosition?.required === false && draftPosition?.onlyInt === true,
    "draft_position is an optional integer (PocketBase 0-value quirk)",
  );
  const isReady = byName.league_members.fields.find((f) => f.name === "is_ready");
  check(
    isReady?.type === "bool" && isReady?.required !== true,
    // `required: true` on a bool is a truthy test, so it would reject `false` —
    // the very value that means "not ready yet".
    "is_ready is an optional bool (a required bool cannot be false)",
  );
  // The read rule that fixed issue #15. Asserted as a shape, not just by
  // behaviour, so a later migration that quietly reverts it is caught here and
  // not by somebody noticing "Unknown member" in a lobby again.
  check(
    byName.users.listRule?.includes("league_members_via_user") === true &&
      byName.users.listRule === byName.users.viewRule,
    "users read rules admit league co-members (list and view agree)",
  );

  // --- unique indexes are the physical backstop -----------------------------
  const alice = await makeUser("alice");
  const bob = await makeUser("bob");
  const league = await makeLeague("Verify League", `V${stamp}`.slice(0, 16), alice.id);
  await makeMember(league.id, alice.id, "Alice AV");

  check(
    await rejects(() => makeMember(league.id, alice.id)),
    "duplicate (league, user) membership rejected by the index",
  );
  check(
    await rejects(() =>
      makeLeague("Clash", `V${stamp}`.slice(0, 16), alice.id),
    ),
    "duplicate invite_code rejected by the index",
  );
  check(
    await rejects(() =>
      su.collection("leagues").create(
        {
          name: "No settings",
          season: "2026-27",
          commissioner: alice.id,
          invite_code: `X${stamp}`.slice(0, 16),
          status: "setup",
        },
        { requestKey: null },
      ),
    ),
    "league without settings rejected (settings is required)",
  );

  // --- read rules, as real users -------------------------------------------
  const aliceClient = await asUser(alice.id);
  const bobClient = await asUser(bob.id);

  check(
    (await listCount(aliceClient, "leagues")) === 1,
    "the commissioner sees her league",
  );
  check(
    (await listCount(bobClient, "leagues")) === 0,
    "an outsider sees no leagues",
  );
  check(
    (await listCount(bobClient, "league_members")) === 0,
    "an outsider sees no memberships",
  );

  await makeMember(league.id, bob.id, "Bob Ballers");
  check(
    (await listCount(bobClient, "leagues")) === 1,
    "after joining, a member sees the league",
  );
  check(
    (await listCount(bobClient, "league_members")) === 2,
    "after joining, a member sees the other members",
  );

  // The one that matters: being a member of ANY league must not reveal EVERY
  // league. This is what the `:alias` join binding in the read rule buys.
  const carol = await makeUser("carol");
  const other = await makeLeague(
    "Other League",
    `O${stamp}`.slice(0, 16),
    carol.id,
  );
  await makeMember(other.id, carol.id, "Carol Crew");
  check(
    (await listCount(bobClient, "leagues")) === 1,
    "a member of one league cannot see another league",
  );
  check(
    (await listCount(bobClient, "league_members")) === 2,
    "a member of one league cannot see another league's members",
  );

  // --- users: co-members have names, strangers do not (issue #15) -----------
  //
  // A membership row you can read is worth nothing if you cannot read who it
  // belongs to. Before 1788181100 the `users` collection was still self-only,
  // so `expand: "user"` came back empty and every other member in the lobby
  // rendered as "Unknown member".
  const carolClient = await asUser(carol.id);

  const aliceSeesUsers = await aliceClient
    .collection("users")
    .getFullList({ requestKey: null });
  check(
    aliceSeesUsers.length === 2 &&
      aliceSeesUsers.every((u) => u.id === alice.id || u.id === bob.id),
    "a member sees exactly themselves and their league co-members",
  );

  const bobAsSeenByAlice = aliceSeesUsers.find((u) => u.id === bob.id);
  check(
    bobAsSeenByAlice?.name === "bob",
    "a co-member's name is readable (this is what fixes 'Unknown member')",
  );
  // PocketBase withholds `email` from everyone but the record's owner and
  // superusers unless `emailVisibility` is set. Widening the READ rule must not
  // quietly have widened that too: a co-member's Google address is a bigger
  // disclosure than their display name, and nothing in the app needs it.
  check(
    !bobAsSeenByAlice?.email,
    "a co-member's email stays hidden (emailVisibility, not the read rule)",
  );

  check(
    await rejects(() =>
      aliceClient.collection("users").getOne(carol.id, { requestKey: null }),
    ),
    "a stranger's user record is not readable",
  );

  // The multi-hop case worth being paranoid about. Put bob in Carol's league as
  // well: bob now shares a league with each of them, but Alice and Carol still
  // share none. If the rule's hops were not bound to a single league, Alice
  // would inherit Carol through bob.
  await makeMember(other.id, bob.id, "Bob Abroad");
  check(
    await rejects(() =>
      aliceClient.collection("users").getOne(carol.id, { requestKey: null }),
    ),
    "sharing a league with someone does not extend to THEIR other leagues",
  );
  check(
    (await listCount(carolClient, "leagues")) === 1,
    "and the same holds in the other direction, for leagues",
  );

  // Sign-up is closed in practice, not just on paper. Both of these run in the
  // `default` request context, so the createRule refuses them.
  const anonymous = new PocketBase(url);
  const signUpPayload = () => {
    const password = crypto.randomUUID();
    return {
      email: `intruder.${crypto.randomUUID()}@verify.invalid`,
      password,
      passwordConfirm: password,
      name: "Intruder",
    };
  };
  check(
    await rejects(() =>
      anonymous
        .collection("users")
        .create(signUpPayload(), { requestKey: null }),
    ),
    "an anonymous visitor cannot create an account",
  );
  check(
    await rejects(() =>
      aliceClient
        .collection("users")
        .create(signUpPayload(), { requestKey: null }),
    ),
    "a signed-in member cannot create an account for someone else",
  );

  check(
    await rejects(() =>
      aliceClient.collection("leagues").create(
        {
          name: "Sneaky",
          season: "2026-27",
          commissioner: alice.id,
          invite_code: `S${stamp}`.slice(0, 16),
          settings: {},
          status: "setup",
        },
        { requestKey: null },
      ),
    ),
    "an authenticated user cannot create a league directly",
  );
} finally {
  // Leave the database as we found it, in reverse dependency order.
  for (const id of created.members)
    await su.collection("league_members").delete(id, { requestKey: null }).catch(() => {});
  for (const id of created.leagues)
    await su.collection("leagues").delete(id, { requestKey: null }).catch(() => {});
  for (const id of created.users)
    await su.collection("users").delete(id, { requestKey: null }).catch(() => {});
}

console.log(
  failures === 0
    ? "\nAll rule and index checks passed."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
