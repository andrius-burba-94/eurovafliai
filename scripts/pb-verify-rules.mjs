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
const created = {
  users: [],
  leagues: [],
  members: [],
  players: [],
  drafts: [],
  picks: [],
};

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
const asUser = async (userId) =>
  su.collection("users").impersonate(userId, 600);

const rejects = async (fn) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

const listCount = async (client, collection) =>
  (await client.collection(collection).getFullList({ requestKey: null }))
    .length;

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
  const canManage = byName.league_members.fields.find(
    (f) => f.name === "can_manage",
  );
  check(
    canManage?.type === "bool" && canManage?.required === false,
    "can_manage is an optional bool (required:true would reject `false`)",
  );

  const draftPosition = byName.league_members.fields.find(
    (f) => f.name === "draft_position",
  );
  check(
    draftPosition?.required === false && draftPosition?.onlyInt === true,
    "draft_position is an optional integer (PocketBase 0-value quirk)",
  );
  const isReady = byName.league_members.fields.find(
    (f) => f.name === "is_ready",
  );
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
  const league = await makeLeague(
    "Verify League",
    `V${stamp}`.slice(0, 16),
    alice.id,
  );
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

  // --- the player pool (slice 2.1) ------------------------------------------
  check(!!byName.players, "players collection exists");
  check(!!byName.roster_imports, "roster_imports collection exists");
  check(!!byName.app_settings, "app_settings collection exists");

  for (const name of ["players", "roster_imports", "app_settings"]) {
    check(
      byName[name].createRule === null &&
        byName[name].updateRule === null &&
        byName[name].deleteRule === null,
      `${name} writes are superuser-only`,
    );
    check(
      byName[name].listRule === '@request.auth.id != ""',
      `${name} is readable by any signed-in member`,
    );
  }

  check(
    byName.players.indexes.some((i) =>
      /UNIQUE.*`person_code`.*WHERE.*person_code.*!=/.test(i),
    ),
    "players.person_code is unique ONLY where it is set (43 of 324 are empty)",
  );
  check(
    byName.players.indexes.some((i) =>
      /UNIQUE.*`name_normalized`.*`club_code`/.test(i),
    ),
    "unique index on players(name_normalized, club_code) backs the fallback match",
  );

  const player = (over) => ({
    name: "Verify, Player",
    name_normalized: `verify player ${stamp}`,
    club_code: "ZAL",
    club_name: "Zalgiris Kaunas",
    position: "G",
    status: "active",
    source: "api",
    ...over,
  });
  const makePlayer = async (over) => {
    const record = await su
      .collection("players")
      .create(player(over), { requestKey: null });
    created.players.push(record.id);
    return record;
  };

  // The whole reason the index is partial. A plain unique index would admit the
  // first codeless player and refuse the other 42.
  await makePlayer({ name_normalized: `codeless one ${stamp}` });
  check(
    !(await rejects(() =>
      makePlayer({ name_normalized: `codeless two ${stamp}` }),
    )),
    "two players with no person_code are both accepted",
  );

  await makePlayer({
    name_normalized: `coded a ${stamp}`,
    person_code: `V${stamp}`,
  });
  check(
    await rejects(() =>
      makePlayer({
        name_normalized: `coded b ${stamp}`,
        person_code: `V${stamp}`,
      }),
    ),
    "a duplicate person_code is refused by the index",
  );

  await makePlayer({ name_normalized: `same name ${stamp}` });
  check(
    await rejects(() => makePlayer({ name_normalized: `same name ${stamp}` })),
    "a duplicate (name_normalized, club_code) is refused by the index",
  );
  check(
    !(await rejects(() =>
      makePlayer({ name_normalized: `same name ${stamp}`, club_code: "MAD" }),
    )),
    "the same name on a different club is fine",
  );

  check(
    await rejects(() =>
      makePlayer({ name_normalized: `bad bucket ${stamp}`, position: "PG" }),
    ),
    "a position outside G/F/C is refused",
  );
  check(
    await rejects(() =>
      makePlayer({
        name_normalized: `bad status ${stamp}`,
        status: "questionable",
      }),
    ),
    "a status outside the four known values is refused",
  );

  check(
    await rejects(() =>
      su
        .collection("app_settings")
        .create(
          { singleton: "app", roster_authority: "csv" },
          { requestKey: null },
        ),
    ),
    "app_settings stays a singleton — a second row is refused",
  );

  const settings = await su
    .collection("app_settings")
    .getFullList({ requestKey: null });
  check(
    settings.length === 1 &&
      ["api", "csv"].includes(settings[0].roster_authority),
    "the seeded roster_authority row exists and holds a valid value",
  );

  // Members read the pool with their own token; nobody writes it from a browser.
  check(
    (await listCount(bobClient, "players")) > 0,
    "a signed-in member can read the player pool",
  );
  check(
    await rejects(() =>
      bobClient.collection("players").create(player({}), { requestKey: null }),
    ),
    "a signed-in member cannot create a player",
  );
  check(
    await rejects(() =>
      bobClient
        .collection("app_settings")
        .update(
          settings[0].id,
          { roster_authority: "csv" },
          { requestKey: null },
        ),
    ),
    "a signed-in member cannot flip the roster authority",
  );

  // --- the draft and its picks (slice 2.4) ----------------------------------
  check(!!byName.drafts, "drafts collection exists");
  check(!!byName.picks, "picks collection exists");

  for (const name of ["drafts", "picks"]) {
    check(
      byName[name].createRule === null &&
        byName[name].updateRule === null &&
        byName[name].deleteRule === null,
      `${name} writes are superuser-only — every state change is a server action`,
    );
    check(
      byName[name].listRule?.includes("league_members:mine") === true,
      `${name} is readable only by members of its own league`,
    );
  }

  check(
    byName.drafts.indexes.some((i) =>
      /UNIQUE.*`league`.*WHERE.*status.*!=.*complete/.test(i),
    ),
    "one unfinished draft per league, enforced by a partial unique index",
  );
  check(
    byName.picks.indexes.some((i) => /UNIQUE.*`draft`.*`overall_no`/.test(i)),
    "unique index on picks(draft, overall_no) — two clients cannot fill one slot",
  );
  check(
    byName.picks.indexes.some((i) => /UNIQUE.*`draft`.*`player`/.test(i)),
    "unique index on picks(draft, player) — one player cannot go twice",
  );

  // The indexes, exercised rather than read. This is the layer that has to hold
  // when two phones submit inside the same millisecond and the validation both
  // of them passed is already out of date.
  const aliceMember = (
    await su.collection("league_members").getFullList({
      filter: `league = '${league.id}' && user = '${alice.id}'`,
      requestKey: null,
    })
  )[0];
  const playerOne = await makePlayer({ name_normalized: `draft one ${stamp}` });
  const playerTwo = await makePlayer({ name_normalized: `draft two ${stamp}` });

  const draftFor = (league, over = {}) => ({
    league,
    format: "snake",
    status: "live",
    order: [aliceMember.id],
    rounds: 13,
    current_pick: 1,
    seed: `verify-${stamp}`,
    ...over,
  });

  const liveDraft = await su
    .collection("drafts")
    .create(draftFor(league.id), { requestKey: null });
  created.drafts.push(liveDraft.id);

  check(
    await rejects(() =>
      su.collection("drafts").create(draftFor(league.id), { requestKey: null }),
    ),
    "a second unfinished draft for the same league is refused",
  );

  const oldDraft = await su
    .collection("drafts")
    .create(draftFor(other.id, { status: "complete" }), {
      requestKey: null,
    });
  created.drafts.push(oldDraft.id);
  const newDraft = await su
    .collection("drafts")
    .create(draftFor(other.id), { requestKey: null });
  created.drafts.push(newDraft.id);
  check(
    !!newDraft.id,
    "a finished draft does not block the next one — the index is partial",
  );

  const pickOf = (over) => ({
    draft: liveDraft.id,
    overall_no: 1,
    round: 1,
    slot: 1,
    member: aliceMember.id,
    player: playerOne.id,
    is_auto: false,
    ...over,
  });

  const firstPick = await su
    .collection("picks")
    .create(pickOf({}), { requestKey: null });
  created.picks.push(firstPick.id);

  check(
    await rejects(() =>
      su
        .collection("picks")
        .create(pickOf({ player: playerTwo.id }), { requestKey: null }),
    ),
    "a second pick at the same overall number is refused",
  );
  check(
    await rejects(() =>
      su.collection("picks").create(pickOf({ overall_no: 2, slot: 2 }), {
        requestKey: null,
      }),
    ),
    "the same player cannot be drafted twice in one draft",
  );

  const secondPick = await su
    .collection("picks")
    .create(pickOf({ overall_no: 2, slot: 2, player: playerTwo.id }), {
      requestKey: null,
    });
  created.picks.push(secondPick.id);
  check(
    secondPick.is_auto === false,
    "is_auto stores false — the bool is not `required`, or PB would reject it",
  );

  check(
    (await listCount(aliceClient, "picks")) === 2,
    "a member reads the picks of their own draft with their own token",
  );
  check(
    (await listCount(aliceClient, "drafts")) === 1,
    "a member sees their own league's draft and no other",
  );

  // Carol is in a different league entirely. She has drafts of her own, which
  // is what makes this a real test of the join rather than of emptiness.
  check(
    (await listCount(carolClient, "drafts")) === 2,
    "an outsider sees their own league's drafts",
  );
  check(
    (await listCount(carolClient, "picks")) === 0,
    "an outsider cannot read another league's board",
  );

} finally {
  // Leave the database as we found it, in reverse dependency order.
  for (const id of created.picks)
    await su
      .collection("picks")
      .delete(id, { requestKey: null })
      .catch(() => {});
  for (const id of created.drafts)
    await su
      .collection("drafts")
      .delete(id, { requestKey: null })
      .catch(() => {});
  for (const id of created.players)
    await su
      .collection("players")
      .delete(id, { requestKey: null })
      .catch(() => {});
  for (const id of created.members)
    await su
      .collection("league_members")
      .delete(id, { requestKey: null })
      .catch(() => {});
  for (const id of created.leagues)
    await su
      .collection("leagues")
      .delete(id, { requestKey: null })
      .catch(() => {});
  for (const id of created.users)
    await su
      .collection("users")
      .delete(id, { requestKey: null })
      .catch(() => {});
}

console.log(
  failures === 0
    ? "\nAll rule and index checks passed."
    : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
