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

import { env, isLocalPocketBase, superuserFromEnv } from "./lib/pb.mjs";

const url = env.PB_INTERNAL_URL;

if (!isLocalPocketBase(url)) {
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

// --- what the schema promises -----------------------------------------------
//
// Every collection the app owns is written by a superuser — a server action or
// the worker — and never with a member's own token. The value says why, where
// that is worth saying. A new collection that is missing here fails the
// "declared" check below rather than shipping with whatever rule it was born
// with.
const SUPERUSER_WRITE = {
  leagues: "",
  league_members: "",
  players: "",
  roster_imports: "",
  app_settings: "",
  drafts: "every state change is a server action",
  picks: "every state change is a server action",
  cheat_sheets: "every save is a server action",
  chat_messages: "the blueprint's client-direct exception is withdrawn",
  player_game_stats: "every import is a server action or the worker",
  stat_imports: "",
  standings_snapshots: "",
  roster_memberships: "",
  transactions: "",
  round_lineups: "",
  player_news: "",
  fixtures: "",
  live_game_snapshots: "the worker writes them",
  fantasy_syncs: "the worker writes them",
  position_questions: "only the worker and the answer action write them",
  ai_writeups: "the worker writes them",
  player_outlooks: "the worker writes them",
  source_player_questions: "",
  basketnews_roster_batches: "",
};
// Google sign-in creates `users` records through createRule, which is asserted
// on its own below.
const WRITABLE_BY_RULE = ["users"];

const SIGNED_IN = '@request.auth.id != ""';
const signedIn = (rule) => rule === SIGNED_IN;
const ownLeague = (rule) => rule?.includes("league_members:mine") === true;

// [collection, does this rule admit the right readers, what that means]
const READ_RULES = [
  ["players", signedIn, "is readable by any signed-in member"],
  ["roster_imports", signedIn, "is readable by any signed-in member"],
  ["app_settings", signedIn, "is readable by any signed-in member"],
  ["drafts", ownLeague, "is readable only by members of its own league"],
  ["picks", ownLeague, "is readable only by members of its own league"],
  [
    "cheat_sheets",
    (rule) => rule === "member.user = @request.auth.id",
    "is readable only by the member who owns it",
  ],
  [
    "chat_messages",
    (rule) =>
      /@collection\.league_members\.league \?= league/.test(rule ?? "") &&
      /@collection\.league_members\.user \?= @request\.auth\.id/.test(rule ?? ""),
    "is readable by members of that league, scoped by the rule rather than by a filter",
  ],
  ["player_game_stats", signedIn, "is readable by any signed-in member — any player's game log"],
  ["standings_snapshots", ownLeague, "is readable only by members of that league"],
  ["roster_memberships", ownLeague, "is readable only by members of that league"],
  ["transactions", ownLeague, "is readable only by members of that league"],
  ["round_lineups", ownLeague, "is readable only by members of that league"],
  ["player_news", signedIn, "is readable by anybody signed in, like the pool itself"],
  ["fixtures", signedIn, "is readable by anybody signed in, like the pool itself"],
  // The read rule that fixed issue #15. Asserted as a shape, not just by
  // behaviour, so a later migration that quietly reverts it is caught here and
  // not by somebody noticing "Unknown member" in a lobby again.
  [
    "users",
    (rule) => rule?.includes("league_members_via_user") === true,
    "read rules admit league co-members",
  ],
];

// [collection, a pattern one of its indexes must match, why]
const INDEXES = [
  ["leagues", /UNIQUE.*invite_code/, "unique index on leagues.invite_code"],
  ["league_members", /UNIQUE.*`league`.*`user`/, "unique index on league_members(league, user)"],
  [
    "players",
    /UNIQUE.*`person_code`.*WHERE.*person_code.*!=/,
    "players.person_code is unique ONLY where it is set (43 of 324 are empty)",
  ],
  [
    "players",
    /UNIQUE.*`name_normalized`.*`club_code`/,
    "unique index on players(name_normalized, club_code) backs the fallback match",
  ],
  [
    "drafts",
    /UNIQUE.*`league`.*WHERE.*status.*!=.*complete/,
    "one unfinished draft per league, enforced by a partial unique index",
  ],
  [
    "picks",
    /UNIQUE.*`draft`.*`overall_no`/,
    "unique index on picks(draft, overall_no) — two clients cannot fill one slot",
  ],
  [
    "picks",
    /UNIQUE.*`draft`.*`player`/,
    "unique index on picks(draft, player) — one player cannot go twice",
  ],
  [
    "cheat_sheets",
    /UNIQUE.*`cheat_sheets`.*\(`member`\)/,
    "unique index on cheat_sheets(member) — one sheet per membership",
  ],
  [
    "chat_messages",
    /`chat_messages`.*\(`league`, ?`created`\)/,
    "index on chat_messages(league, created) — every read is 'this league, in order'",
  ],
  [
    "player_game_stats",
    /UNIQUE.*`player_game_stats`.*\(`player`,\s*`season`,\s*`game_code`\)/,
    "unique index on player_game_stats(player, season, game_code) — what makes a re-run safe",
  ],
  [
    "standings_snapshots",
    /UNIQUE.*`standings_snapshots`.*\(`league`,\s*`season`,\s*`round`\)/,
    "unique index on standings_snapshots(league, season, round)",
  ],
  [
    "roster_memberships",
    /UNIQUE.*`roster_memberships`.*\(`league`,\s*`player`\).*`to_date`/,
    "partial unique index on active roster_memberships(league, player)",
  ],
  [
    "transactions",
    /`transactions`.*\(`league`,\s*`from_round`\)/,
    "index on transactions(league, from_round)",
  ],
  [
    "round_lineups",
    /UNIQUE.*`round_lineups`.*\(`league`,\s*`member`,\s*`season`,\s*`round`\)/,
    "unique index on round_lineups(league, member, season, round)",
  ],
  [
    "player_news",
    /UNIQUE.*`player_news`.*\(`source`,\s*`source_key`\)/,
    "unique index on player_news(source, source_key)",
  ],
  [
    "fixtures",
    /UNIQUE.*`fixtures`.*\(`season`,\s*`game_code`\)/,
    "unique index on fixtures(season, game_code)",
  ],
  [
    "fixtures",
    /^(?!.*UNIQUE).*`fixtures`.*\(`season`,\s*`round`\)/,
    "the (season, round) index is NOT unique — a round holds ten games",
  ],
  ["live_game_snapshots", /UNIQUE.*idx_live_game/, "live snapshots have a unique season/game index"],
  [
    "position_questions",
    /UNIQUE.*`open_key`.*WHERE.*`open_key` != ''/,
    "one open question per key, held by a partial unique index",
  ],
  ["leagues", /UNIQUE.*_slug`.*WHERE/, "leagues carry a partial unique slug index"],
  ["league_members", /UNIQUE.*_slug`.*WHERE/, "teams carry a partial unique slug index"],
  ["players", /UNIQUE.*_slug`.*WHERE/, "players carry a partial unique slug index"],
  [
    "ai_writeups",
    /UNIQUE.*`ai_writeups`.*\(`league`,\s*`season`,\s*`round`,\s*`kind`,\s*`member`\)/,
    "unique index on ai_writeups(league, season, round, kind, member)",
  ],
  [
    "player_outlooks",
    /UNIQUE.*`player_outlooks`.*\(`season`,\s*`ruleset`,\s*`player`\)/,
    "unique index on player_outlooks(season, ruleset, player)",
  ],
];

// `required: true` on a bool or a number is a truthy test, so it would reject
// `false` and `0` — the values that mean "not yet" (PocketBase 0-value quirk).
const optionalBool = (field) => field?.type === "bool" && field.required !== true;
const optionalInt = (field) =>
  field?.type === "number" && field.onlyInt === true && field.required !== true;
const present = (field) => !!field;
const floorless = (field) => field?.min === null || field?.min === undefined;

// [collection, field, does it have the right shape, why]
const FIELDS = [
  ["league_members", "can_manage", optionalBool, "can_manage is an optional bool (required:true would reject `false`)"],
  ["league_members", "draft_position", optionalInt, "draft_position is an optional integer (PocketBase 0-value quirk)"],
  ["league_members", "is_ready", optionalBool, "is_ready is an optional bool (a required bool cannot be false)"],
  ...["proj_last5_fantasy", "proj_last5_games", "proj_season_fantasy", "proj_season_games"].map((name) => [
    "players",
    name,
    optionalInt,
    `players.${name} is an optional integer (a required 0 would be refused)`,
  ]),
  ...["basketnews_position_confirmed", "fantasy_position_confirmed", "basketnews_listed", "fantasy_listed"].map(
    (name) => ["players", name, optionalBool, `players.${name} is an optional bool`],
  ),
  ["players", "fantasy_position", present, "players carry the Fantasy Challenge's position"],
  ["leagues", "positions_read_at", present, "leagues record when their game was last read"],
  [
    "player_game_stats",
    "fantasy_pts",
    (field) => field?.onlyInt === true,
    "fantasy_pts is an integer column — tenths, never a float",
  ],
  ...["pir", "fantasy_pts", "plus_minus"].map((name) => [
    "player_game_stats",
    name,
    floorless,
    `${name} has no floor — a bad night is allowed to be negative`,
  ]),
  [
    "chat_messages",
    "author",
    (field) => field?.required === false,
    "chat_messages.author is optional — null is how the app itself speaks",
  ],
  [
    "chat_messages",
    "author",
    (field) => field?.cascadeDelete === false,
    "chat_messages.author does NOT cascade — a member leaving must not turn their messages into system announcements",
  ],
  ["ai_writeups", "facts", (field) => field?.hidden === true, "the facts a model read are hidden from every API reader"],
];

// --- fixtures ---------------------------------------------------------------
//
// Deleted in this order — reverse dependency — so the database is left as we
// found it.
const CLEANUP_ORDER = [
  "source_player_questions",
  "basketnews_roster_batches",
  "position_questions",
  "ai_writeups",
  "player_outlooks",
  "fantasy_syncs",
  "live_game_snapshots",
  "fixtures",
  "player_news",
  "round_lineups",
  "transactions",
  "roster_memberships",
  "standings_snapshots",
  "stat_imports",
  "player_game_stats",
  "chat_messages",
  "cheat_sheets",
  "picks",
  "drafts",
  "players",
  "league_members",
  "leagues",
  "users",
];
const created = Object.fromEntries(CLEANUP_ORDER.map((name) => [name, []]));

const stamp = Date.now();

// The script is sequential, so the SDK's duplicate-request cancellation (the
// reason app code passes `requestKey: null`) can only ever cancel something by
// mistake.
const su = (await superuserFromEnv()).autoCancellation(false);

/** Create through `client` and remember the record, whoever wrote it. */
const make = async (collection, data, client = su) => {
  const record = await client.collection(collection).create(data);
  created[collection].push(record.id);
  return record;
};

const makeUser = (label) => {
  // No password: `passwordAuth` is disabled on `users`, and these clients
  // authenticate by superuser impersonation instead. PocketBase still requires
  // the field on an auth record, so it gets a random one nothing ever uses.
  const throwaway = crypto.randomUUID();
  return make("users", {
    email: `${label}.${stamp}@verify.invalid`,
    password: throwaway,
    passwordConfirm: throwaway,
    name: label,
    verified: true,
  });
};

const makeLeague = (name, code, commissioner) =>
  make("leagues", {
    name,
    season: "2026-27",
    commissioner,
    invite_code: code,
    settings: { roster_template: { G: 5, F: 5, C: 3 } },
    status: "setup",
  });

const makeMember = (league, user, teamName) =>
  make("league_members", { league, user, team_name: teamName });

// Authenticate as a real (non-superuser) user WITHOUT password auth: a
// superuser mints a short-lived token for the record and the SDK hands back a
// client already carrying it. This is the only way to exercise the read rules
// as an end user now that `passwordAuth` is off — and it is closer to
// production anyway, where every session token comes from Google.
const asUser = async (userId) =>
  (await su.collection("users").impersonate(userId, 600)).autoCancellation(false);

const rejects = async (fn) => {
  try {
    await fn();
    return false;
  } catch {
    return true;
  }
};

const listCount = async (client, collection) =>
  (await client.collection(collection).getFullList()).length;

try {
  // --- schema shape ---------------------------------------------------------
  const collections = await su.collections.getFullList();
  const byName = Object.fromEntries(collections.map((c) => [c.name, c]));
  const owned = collections.filter((c) => !c.system);

  for (const [name, why] of Object.entries(SUPERUSER_WRITE)) {
    const collection = byName[name];
    check(!!collection, `${name} collection exists`);
    check(
      collection?.createRule === null &&
        collection?.updateRule === null &&
        collection?.deleteRule === null,
      `${name} writes are superuser-only${why ? ` — ${why}` : ""}`,
    );
  }
  const undeclared = owned
    .map((c) => c.name)
    .filter((name) => !(name in SUPERUSER_WRITE) && !WRITABLE_BY_RULE.includes(name));
  check(
    undeclared.length === 0,
    `every collection is declared superuser-write or allowlisted (undeclared: ${undeclared.join(", ") || "none"})`,
  );

  for (const [name, admits, meaning] of READ_RULES) {
    check(
      admits(byName[name]?.listRule) && admits(byName[name]?.viewRule),
      `${name} ${meaning} (list and view)`,
    );
  }
  const split = owned.filter((c) => c.listRule !== c.viewRule).map((c) => c.name);
  check(
    split.length === 0,
    `list and view rules agree on every collection (differ: ${split.join(", ") || "none"})`,
  );

  for (const [name, pattern, why] of INDEXES) {
    check(byName[name]?.indexes.some((index) => pattern.test(index)) === true, why);
  }

  for (const [collection, name, shaped, why] of FIELDS) {
    check(shaped(byName[collection]?.fields.find((f) => f.name === name)), why);
  }

  // Which records can block a league delete.
  //
  // `deleteLeague` removes the league and lets PocketBase's cascade take the
  // rest — but PB refuses to delete a record while a **required**,
  // non-cascading relation still points at it, even when that pointing record
  // is itself slated for the same cascade. So every such reference to
  // `league_members` has to be deleted by hand, in order, first; a reference
  // like that which nobody has taught `deleteLeague` about is a league that
  // cannot be deleted at all, and it fails *after* the drafts are gone.
  //
  // That is not hypothetical: 5.1's `roster_memberships.member` shipped
  // unhandled and took production's only league with it (see STATUS.md). This
  // check is here so the next collection to add one fails CI instead.
  const blockers = (targetId) =>
    owned
      .flatMap((c) =>
        (c.fields ?? [])
          .filter(
            (f) =>
              f.type === "relation" &&
              f.collectionId === targetId &&
              f.required === true &&
              f.cascadeDelete !== true,
          )
          .map((f) => `${c.name}.${f.name}`),
      )
      .sort();

  // `picks.member` goes with its draft (`picks.draft` cascades), and
  // `roster_memberships.member` goes through `clearLeagueMemberships`.
  const HANDLED_BY_DELETE_LEAGUE = ["picks.member", "roster_memberships.member"];
  const memberBlockers = blockers(byName.league_members.id);
  check(
    memberBlockers.join(",") === HANDLED_BY_DELETE_LEAGUE.join(","),
    `every required non-cascading reference to league_members is handled by deleteLeague ` +
      `(found ${memberBlockers.join(", ") || "none"}; handled ${HANDLED_BY_DELETE_LEAGUE.join(", ")})`,
  );
  const leagueBlockers = blockers(byName.leagues.id);
  check(
    leagueBlockers.length === 0,
    `nothing holds a required non-cascading reference to leagues ` +
      `(found ${leagueBlockers.join(", ") || "none"})`,
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

  // --- unique indexes are the physical backstop -----------------------------
  const alice = await makeUser("alice");
  const bob = await makeUser("bob");
  const league = await makeLeague("Verify League", `V${stamp}`.slice(0, 16), alice.id);
  const aliceMember = await makeMember(league.id, alice.id, "Alice AV");

  check(
    await rejects(() => makeMember(league.id, alice.id)),
    "duplicate (league, user) membership rejected by the index",
  );
  check(
    await rejects(() => makeLeague("Clash", `V${stamp}`.slice(0, 16), alice.id)),
    "duplicate invite_code rejected by the index",
  );
  check(
    await rejects(() =>
      make("leagues", {
        name: "No settings",
        season: "2026-27",
        commissioner: alice.id,
        invite_code: `X${stamp}`.slice(0, 16),
        status: "setup",
      }),
    ),
    "league without settings rejected (settings is required)",
  );

  // --- read rules, as real users -------------------------------------------
  const aliceClient = await asUser(alice.id);
  const bobClient = await asUser(bob.id);

  check((await listCount(aliceClient, "leagues")) === 1, "the commissioner sees her league");
  check((await listCount(bobClient, "leagues")) === 0, "an outsider sees no leagues");
  check((await listCount(bobClient, "league_members")) === 0, "an outsider sees no memberships");

  const bobMember = await makeMember(league.id, bob.id, "Bob Ballers");
  check((await listCount(bobClient, "leagues")) === 1, "after joining, a member sees the league");
  check(
    (await listCount(bobClient, "league_members")) === 2,
    "after joining, a member sees the other members",
  );

  // The one that matters: being a member of ANY league must not reveal EVERY
  // league. This is what the `:alias` join binding in the read rule buys.
  const carol = await makeUser("carol");
  const other = await makeLeague("Other League", `O${stamp}`.slice(0, 16), carol.id);
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

  const aliceSeesUsers = await aliceClient.collection("users").getFullList();
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
    await rejects(() => aliceClient.collection("users").getOne(carol.id)),
    "a stranger's user record is not readable",
  );

  // The multi-hop case worth being paranoid about. Put bob in Carol's league as
  // well: bob now shares a league with each of them, but Alice and Carol still
  // share none. If the rule's hops were not bound to a single league, Alice
  // would inherit Carol through bob.
  await makeMember(other.id, bob.id, "Bob Abroad");
  check(
    await rejects(() => aliceClient.collection("users").getOne(carol.id)),
    "sharing a league with someone does not extend to THEIR other leagues",
  );
  check(
    (await listCount(carolClient, "leagues")) === 1,
    "and the same holds in the other direction, for leagues",
  );

  // Sign-up is closed in practice, not just on paper. Both of these run in the
  // `default` request context, so the createRule refuses them.
  const anonymous = new PocketBase(url).autoCancellation(false);
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
    await rejects(() => make("users", signUpPayload(), anonymous)),
    "an anonymous visitor cannot create an account",
  );
  check(
    await rejects(() => make("users", signUpPayload(), aliceClient)),
    "a signed-in member cannot create an account for someone else",
  );

  check(
    await rejects(() =>
      make(
        "leagues",
        {
          name: "Sneaky",
          season: "2026-27",
          commissioner: alice.id,
          invite_code: `S${stamp}`.slice(0, 16),
          settings: {},
          status: "setup",
        },
        aliceClient,
      ),
    ),
    "an authenticated user cannot create a league directly",
  );

  // --- the player pool (slice 2.1) ------------------------------------------
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
  const makePlayer = (over) => make("players", player(over));

  // The whole reason the index is partial. A plain unique index would admit the
  // first codeless player and refuse the other 42.
  await makePlayer({ name_normalized: `codeless one ${stamp}` });
  check(
    !(await rejects(() => makePlayer({ name_normalized: `codeless two ${stamp}` }))),
    "two players with no person_code are both accepted",
  );

  await makePlayer({ name_normalized: `coded a ${stamp}`, person_code: `V${stamp}` });
  check(
    await rejects(() =>
      makePlayer({ name_normalized: `coded b ${stamp}`, person_code: `V${stamp}` }),
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
    await rejects(() => makePlayer({ name_normalized: `bad bucket ${stamp}`, position: "PG" })),
    "a position outside G/F/C is refused",
  );
  check(
    await rejects(() =>
      makePlayer({ name_normalized: `bad status ${stamp}`, status: "questionable" }),
    ),
    "a status outside the four known values is refused",
  );

  check(
    await rejects(() => su.collection("app_settings").create({ singleton: "app", roster_authority: "csv" })),
    "app_settings stays a singleton — a second row is refused",
  );

  const settings = await su.collection("app_settings").getFullList();
  check(
    settings.length === 1 && ["api", "csv"].includes(settings[0].roster_authority),
    "the seeded roster_authority row exists and holds a valid value",
  );

  // Members read the pool with their own token; nobody writes it from a browser.
  check((await listCount(bobClient, "players")) > 0, "a signed-in member can read the player pool");
  check(
    await rejects(() => make("players", player({}), bobClient)),
    "a signed-in member cannot create a player",
  );
  check(
    await rejects(() =>
      bobClient.collection("app_settings").update(settings[0].id, { roster_authority: "csv" }),
    ),
    "a signed-in member cannot flip the roster authority",
  );

  // --- the draft and its picks (slice 2.4) ----------------------------------
  //
  // The indexes, exercised rather than read. This is the layer that has to hold
  // when two phones submit inside the same millisecond and the validation both
  // of them passed is already out of date.
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

  const liveDraft = await make("drafts", draftFor(league.id));
  check(
    await rejects(() => make("drafts", draftFor(league.id))),
    "a second unfinished draft for the same league is refused",
  );

  await make("drafts", draftFor(other.id, { status: "complete" }));
  const newDraft = await make("drafts", draftFor(other.id));
  check(!!newDraft.id, "a finished draft does not block the next one — the index is partial");

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

  await make("picks", pickOf({}));
  check(
    await rejects(() => make("picks", pickOf({ player: playerTwo.id }))),
    "a second pick at the same overall number is refused",
  );
  check(
    await rejects(() => make("picks", pickOf({ overall_no: 2, slot: 2 }))),
    "the same player cannot be drafted twice in one draft",
  );

  const secondPick = await make("picks", pickOf({ overall_no: 2, slot: 2, player: playerTwo.id }));
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
  check((await listCount(carolClient, "drafts")) === 2, "an outsider sees their own league's drafts");
  check((await listCount(carolClient, "picks")) === 0, "an outsider cannot read another league's board");

  // --- cheat sheets, and the privacy they promise (slice 3.4) ---------------
  //
  // This is the only collection in the app that is private *within* a league,
  // so it is the only one whose read rule cannot be checked by "can an outsider
  // see it". The question that matters is whether Bob — a member of the same
  // league, sitting at the same table — can read Alice's ranking.
  await make("cheat_sheets", {
    member: aliceMember.id,
    ranking: [playerOne.id, playerTwo.id],
    tiers: [1],
    source: "csv",
  });
  check(
    await rejects(() =>
      make("cheat_sheets", { member: aliceMember.id, ranking: [], tiers: [], source: "manual" }),
    ),
    "a second cheat sheet for the same membership is refused",
  );

  const bobSheet = await make("cheat_sheets", {
    member: bobMember.id,
    ranking: [playerTwo.id],
    tiers: [],
    source: "csv",
  });

  check((await listCount(aliceClient, "cheat_sheets")) === 1, "a member reads their own cheat sheet");
  check(
    await rejects(() => aliceClient.collection("cheat_sheets").getOne(bobSheet.id)),
    "a member of the SAME league cannot read another member's cheat sheet",
  );
  check((await listCount(carolClient, "cheat_sheets")) === 0, "an outsider reads no cheat sheets at all");

  // --- league chat (slice 3.5) ----------------------------------------------
  //
  // The opposite privacy shape to a cheat sheet: a message is readable by
  // *everybody in the league* and by nobody outside it. So the question that
  // matters here is the one a cheat sheet cannot ask — can Carol, who belongs
  // to no league, read a word of it, and can Bob read Alice's message (he
  // must).
  await make("chat_messages", {
    league: league.id,
    author: aliceMember.id,
    body: "is everyone here",
    kind: "user",
    deleted: false,
  });
  const systemSaid = await make("chat_messages", {
    league: league.id,
    body: "The draft is paused.",
    kind: "system",
  });

  check(
    (await listCount(aliceClient, "chat_messages")) === 2,
    "a member reads the whole conversation, their own line and the app's",
  );
  check(
    (await listCount(bobClient, "chat_messages")) === 2,
    "another member of the SAME league reads it too — chat is shared, unlike a sheet",
  );
  check((await listCount(carolClient, "chat_messages")) === 0, "an outsider reads no chat at all");
  check(
    await rejects(() =>
      make(
        "chat_messages",
        { league: league.id, author: aliceMember.id, body: "straight from the browser", kind: "user" },
        aliceClient,
      ),
    ),
    "a member cannot write chat with their own token — it goes through a server action",
  );
  check(
    await rejects(() => aliceClient.collection("chat_messages").delete(systemSaid.id)),
    "a member cannot delete a system announcement with their own token",
  );

  // --- 4.1 box scores -----------------------------------------------------
  //
  // Stats are the opposite of a cheat sheet: readable by anybody signed in,
  // because a player profile and a standings table are the point of storing
  // them. What must hold is that nobody writes one from a browser — the
  // scoring rules live in git, not in a rule expression — and that the unique
  // index really refuses a second row for the same game, since that index is
  // the entire failure-recovery story for an import with no transaction
  // around it.
  const gameLine = {
    player: playerOne.id,
    season: "E1999",
    game_code: 1,
    round: 1,
    phase: "RS",
    club_code: "VER",
  };
  const aliceLine = await make("player_game_stats", {
    ...gameLine,
    team_score: 85,
    opponent_score: 78,
    points: 7,
    reb_total: 3,
    assists: 2,
    fga2: 7,
    fgm2: 3,
    fga3: 4,
    fgm3: 0,
    fta: 1,
    ftm: 1,
    blocks_against: 1,
    fouls_committed: 2,
    fouls_drawn: 2,
    pir: 3,
    fantasy_pts: 33,
  });

  check(
    await rejects(() => make("player_game_stats", gameLine)),
    "a second row for the same player, season and game is refused by the index",
  );
  check(
    (await listCount(carolClient, "player_game_stats")) >= 1,
    "a signed-in outsider still reads box scores — they are not league-private",
  );
  check(
    await rejects(() =>
      make("player_game_stats", { ...gameLine, game_code: 2, pir: 99 }, aliceClient),
    ),
    "a member cannot invent a box score with their own token",
  );
  check(
    await rejects(() => aliceClient.collection("player_game_stats").update(aliceLine.id, { pir: 99 })),
    "a member cannot rewrite a stored PIR with their own token",
  );

  const batch = await make("stat_imports", {
    source: "csv",
    season: "E1999",
    applied: false,
    rows: 1,
    plan: {},
  });
  check(
    await rejects(() => aliceClient.collection("stat_imports").update(batch.id, { applied: true })),
    "a member cannot mark an import batch applied with their own token",
  );

  // --- 4.5 standings snapshots --------------------------------------------
  const snapshotOf = (over) => ({
    league: league.id,
    season: "E1999",
    round: 1,
    phase: "RS",
    table: [],
    ...over,
  });
  await make(
    "standings_snapshots",
    snapshotOf({ table: [{ memberId: aliceMember.id, totalTenths: 142, roundTenths: 142 }] }),
  );

  check(
    (await listCount(aliceClient, "standings_snapshots")) === 1,
    "a member reads their league's standings snapshot",
  );
  check(
    (await listCount(carolClient, "standings_snapshots")) === 0,
    "a member of another league cannot read this league's snapshots",
  );
  check(
    await rejects(() => make("standings_snapshots", snapshotOf({ round: 2 }), aliceClient)),
    "a member cannot write a standings snapshot with their own token",
  );
  check(
    await rejects(() => make("standings_snapshots", snapshotOf({}))),
    "a second snapshot for the same league, season and round is refused",
  );

  // --- 5.1 roster memberships ---------------------------------------------
  const windowOf = (over) => ({
    league: league.id,
    member: aliceMember.id,
    player: playerOne.id,
    from_date: "2026-09-08 12:00:00.000Z",
    to_date: "",
    acquired_via: "draft",
    ...over,
  });
  await make("roster_memberships", windowOf({}));

  check(
    (await listCount(aliceClient, "roster_memberships")) === 1,
    "a member reads their league's roster memberships",
  );
  check(
    (await listCount(carolClient, "roster_memberships")) === 0,
    "a member of another league cannot read this league's memberships",
  );
  check(
    await rejects(() => make("roster_memberships", windowOf({}), aliceClient)),
    "a member cannot write a roster membership with their own token",
  );
  check(
    await rejects(() =>
      make(
        "roster_memberships",
        windowOf({ member: bobMember.id, from_date: "2026-09-08 13:00:00.000Z" }),
      ),
    ),
    "a second active membership for the same player in one league is refused",
  );
  const closed = await make(
    "roster_memberships",
    windowOf({
      member: bobMember.id,
      from_date: "2026-08-01 12:00:00.000Z",
      to_date: "2026-09-01 12:00:00.000Z",
      acquired_via: "trade",
    }),
  );
  check(!!closed.id, "a closed membership for the same player does not trip the active unique");

  // --- 5.2 transactions ----------------------------------------------------
  const dealOf = (over) => ({
    league: league.id,
    type: "trade",
    date: "2026-09-08 12:00:00.000Z",
    from_round: 2,
    members: [aliceMember.id, bobMember.id],
    players_in: { [aliceMember.id]: [playerOne.id] },
    players_out: { [bobMember.id]: [playerOne.id] },
    note: "",
    ...over,
  });
  await make("transactions", dealOf({}));

  for (const [type, players_in, players_out] of [
    ["drop", {}, { [aliceMember.id]: [playerOne.id] }],
    ["add", { [aliceMember.id]: [playerOne.id] }, {}],
  ]) {
    const oneSided = await make(
      "transactions",
      dealOf({ type, members: [aliceMember.id], players_in, players_out }),
    ).catch(() => null);
    check(
      !!oneSided,
      `a superuser can record ${type === "drop" ? "a drop" : "an add"}, with one side empty`,
    );
  }

  check(
    (await listCount(aliceClient, "transactions")) === 3,
    "a member reads their league's transactions",
  );
  check(
    (await listCount(carolClient, "transactions")) === 0,
    "a member of another league cannot read this league's transactions",
  );
  check(
    await rejects(() =>
      make(
        "transactions",
        dealOf({
          type: "drop",
          from_round: 3,
          members: [aliceMember.id],
          players_in: {},
          players_out: { [aliceMember.id]: [playerOne.id] },
        }),
        aliceClient,
      ),
    ),
    "a member cannot write a transaction with their own token",
  );

  // --- 9.3 round_lineups ---------------------------------------------------
  const lineupOf = (over) => ({
    league: league.id,
    member: aliceMember.id,
    season: "E2026",
    round: 1,
    slots: { starters: [playerOne.id], captain: playerOne.id, sixth: [], bench: [], inactive: [] },
    source: "recorded",
    ...over,
  });
  await make("round_lineups", lineupOf({ recorded_by: alice.id }));

  check((await listCount(aliceClient, "round_lineups")) === 1, "a member reads their league's lineups");
  check(
    (await listCount(carolClient, "round_lineups")) === 0,
    "a member of another league cannot read this league's lineups",
  );
  check(
    await rejects(() => make("round_lineups", lineupOf({ round: 2 }), aliceClient)),
    "a member cannot write a lineup with their own token",
  );
  check(
    await rejects(() => make("round_lineups", lineupOf({}))),
    "a second lineup for the same member and round is refused",
  );

  // --- 9.4 player_news -----------------------------------------------------
  const newsItem = {
    source: "rotowire",
    source_key: `verify-${stamp}|2026-09-14|verification item`,
    slug: `verify-${stamp}`,
    player: playerOne.id,
    name: "Verify, Player",
    club_name: "Verification Club",
    position: "G",
    body_part: "Knee",
    headline: "Verification item",
    url: "https://www.rotowire.com/euro/player/verify",
    published: "2026-09-14",
    status: "injured",
    applied: true,
  };
  await make("player_news", newsItem);

  check(
    (await listCount(carolClient, "player_news")) >= 1,
    "a signed-in member of any league reads the news",
  );
  check(
    await rejects(() =>
      make(
        "player_news",
        { ...newsItem, source_key: `verify-${stamp}|2026-09-14|by alice` },
        aliceClient,
      ),
    ),
    "a member cannot write a news item with their own token",
  );
  check(
    await rejects(() => make("player_news", newsItem)),
    "the same item read twice is refused rather than stored twice",
  );

  // --- 10.7 fixtures -------------------------------------------------------
  //
  // A season code of its own, and short: the field is 12 characters because a
  // real one is "E2026".
  const verifySeason = `V${String(stamp).slice(-6)}`;
  const fixture = {
    season: verifySeason,
    game_code: 1,
    round: 1,
    phase: "RS",
    local_club: "AAA",
    road_club: "BBB",
    played: false,
    local_score: 0,
    road_score: 0,
    utc_date: "2026-10-01T18:00:00Z",
  };
  await make("fixtures", fixture);

  check(
    (await listCount(carolClient, "fixtures")) >= 1,
    "a signed-in member of any league reads the schedule",
  );
  check(
    await rejects(() => make("fixtures", { ...fixture, game_code: 2 }, aliceClient)),
    "a member cannot write a fixture with their own token",
  );
  check(
    await rejects(() => make("fixtures", fixture)),
    "the same game read twice is refused rather than stored twice",
  );
  // The other half of that index: the same game code in another season is a
  // different game, and E2025 and E2026 both number from 1.
  const otherSeason = await make("fixtures", { ...fixture, season: `W${String(stamp).slice(-6)}` });
  check(!!otherSeason.id, "the same game code in another season is allowed");

  const liveSnapshot = {
    season: verifySeason,
    game_code: 1,
    round: 1,
    live: false,
    local_score: 0,
    road_score: 0,
    players: [],
    checked_at: new Date().toISOString(),
  };
  await make("live_game_snapshots", liveSnapshot);
  check(
    (
      await aliceClient
        .collection("live_game_snapshots")
        .getFullList({ filter: `season = '${liveSnapshot.season}'` })
    ).length === 1,
    "a signed-in member reads the derived live snapshot",
  );
  check(
    await rejects(() => make("live_game_snapshots", { ...liveSnapshot, game_code: 2 }, aliceClient)),
    "a signed-in member cannot invent a live snapshot",
  );
  check(
    await rejects(() => make("live_game_snapshots", liveSnapshot)),
    "a duplicate season/game snapshot is refused",
  );

  // --- 5.5 Fantasy Challenge sync -------------------------------------------
  const fantasyId = `v${stamp}`;
  await su.collection("players").update(playerOne.id, { fantasy_id: fantasyId });
  check(
    await rejects(() => su.collection("players").update(playerTwo.id, { fantasy_id: fantasyId })),
    "two pool players cannot claim one official player",
  );
  check(
    !(await rejects(() => su.collection("players").update(playerTwo.id, { fantasy_id: "" }))),
    "any number of pool players may be unlinked",
  );
  const syncRun = (over) => ({
    league: league.id,
    mode: "preview",
    round: 3,
    ran_at: "2026-10-01 09:00:00.000Z",
    status: "preview",
    message: "verify",
    ...over,
  });
  await make("fantasy_syncs", syncRun({}));
  check(
    (await listCount(aliceClient, "fantasy_syncs")) === 1,
    "the commissioner reads her league's sync runs",
  );
  check((await listCount(carolClient, "fantasy_syncs")) === 0, "a member of another league cannot read them");
  check(
    await rejects(() =>
      make("fantasy_syncs", syncRun({ mode: "apply", status: "applied", message: "" }), aliceClient),
    ),
    "a member cannot invent a sync run",
  );

  // --- 7.2 D each game's positions, and position questions -------------------
  const question = (over) => ({
    league: league.id,
    source: "fantasy",
    kind: "player",
    player: playerOne.id,
    status: "open",
    open_key: `player:${league.id}:${playerOne.id}`,
    ...over,
  });
  await make("position_questions", question({ stored_position: "C", read_position: "F" }));
  check(
    (await listCount(aliceClient, "position_questions")) === 1,
    "the commissioner reads her league's position questions",
  );
  check((await listCount(bobClient, "position_questions")) === 0, "a plain member does not see them");
  check(
    (await listCount(carolClient, "position_questions")) === 0,
    "another league's commissioner does not see them",
  );
  await su.collection("league_members").update(bobMember.id, { can_manage: true });
  check(
    (await listCount(bobClient, "position_questions")) === 1,
    "a deputy the commissioner trusts sees them",
  );
  await su.collection("league_members").update(bobMember.id, { can_manage: false });
  check(
    await rejects(() => make("position_questions", question({}))),
    "a second open question about the same player in the same league is refused",
  );
  check(
    !(await rejects(async () => {
      for (let answered = 0; answered < 2; answered += 1) {
        await make("position_questions", question({ status: "answered", open_key: "" }));
      }
    })),
    "answered questions about one player do not collide",
  );
  check(
    await rejects(() =>
      make("position_questions", question({ player: undefined, open_key: `x${stamp}` }), aliceClient),
    ),
    "a manager cannot invent a question",
  );

  // --- S28 readable addresses -------------------------------------------------
  const slug = `verify-${stamp}`;
  await su.collection("players").update(playerOne.id, { slug });
  check(
    await rejects(() => su.collection("players").update(playerTwo.id, { slug })),
    "two players cannot share an address",
  );
  check(
    !(await rejects(() => su.collection("players").update(playerTwo.id, { slug: "" }))),
    "any number of players may wait for a slug",
  );
  check(
    await rejects(() => su.collection("players").update(playerTwo.id, { slug: "Not A Slug" })),
    "a slug is lowercase letters, digits and hyphens",
  );
  check(
    await rejects(() => aliceClient.collection("leagues").update(league.id, { slug: "taken-over" })),
    "a member cannot rename the league's address",
  );
  await su.collection("players").update(playerOne.id, { slug: "" });

  // --- 7.0 AI write-ups -------------------------------------------------------
  const writeup = (member) => ({
    league: league.id,
    season: "E1999",
    round: 4,
    kind: "round_summary",
    member,
    status: "ready",
    voice: "analyst",
    input_hash: "a".repeat(64),
    facts: { text: "@T1 won" },
    output: { lines: ["@T1 won."] },
  });
  const leagueWide = await make("ai_writeups", writeup(""));
  const alicesOwn = await make("ai_writeups", writeup(aliceMember.id));
  check(
    (await listCount(aliceClient, "ai_writeups")) === 2,
    "a member reads the league's write-up and her own",
  );
  check(
    (await listCount(bobClient, "ai_writeups")) === 1,
    "a co-member reads the league's write-up but not hers",
  );
  check(
    await rejects(() => bobClient.collection("ai_writeups").getOne(alicesOwn.id)),
    "a co-member cannot open her private write-up by id",
  );
  check((await listCount(carolClient, "ai_writeups")) === 0, "a member of another league reads none");
  const seen = await aliceClient.collection("ai_writeups").getOne(leagueWide.id);
  check(
    seen.facts === undefined && Array.isArray(seen.output?.lines),
    "a reader gets the prose without the facts",
  );
  check(
    await rejects(() => make("ai_writeups", writeup(""))),
    "a second league-wide write-up for the same round and kind is refused",
  );
  check(
    await rejects(() => make("ai_writeups", writeup(aliceMember.id))),
    "a second private write-up for the same member is refused",
  );
  await make("ai_writeups", writeup(bobMember.id));
  check(
    (await listCount(bobClient, "ai_writeups")) === 2,
    "another member may have his own write-up for the same round, and reads it",
  );
  check(
    await rejects(() => make("ai_writeups", writeup(""), aliceClient)),
    "a member cannot write a write-up with her own token",
  );

  // 7.2 G: a member's scout reasons are a private row of their own kind.
  const alicesReasons = await make("ai_writeups", {
    ...writeup(aliceMember.id),
    kind: "scout_moves",
    output: { reasons: { "a|b": "#P1 starts." } },
  });
  check(
    await rejects(() => bobClient.collection("ai_writeups").getOne(alicesReasons.id)),
    "a co-member cannot open her scout reasons",
  );
  check(
    (await aliceClient.collection("ai_writeups").getOne(alicesReasons.id)).output?.reasons?.["a|b"] ===
      "#P1 starts.",
    "a member reads her own scout reasons",
  );

  // 7.3 B: a member's brief is a private row too, hidden from the commissioner.
  const bobsBrief = await make("ai_writeups", {
    ...writeup(bobMember.id),
    kind: "round_brief",
    output: { result: "You won.", standing: "You lead.", next: "An easy run." },
  });
  check(
    await rejects(() => aliceClient.collection("ai_writeups").getOne(bobsBrief.id)),
    "the commissioner cannot open a member's brief",
  );
  check(
    (await bobClient.collection("ai_writeups").getOne(bobsBrief.id)).output?.standing === "You lead.",
    "a member reads his own brief",
  );

  // 7.2 E: outlooks are the same for everyone and written by the worker only.
  const outlookPlayer = await make("players", {
    name: `Verify Outlook ${stamp}`,
    name_normalized: `verify outlook ${stamp}`,
    club_code: "VRF",
    club_name: "Verify",
    position: "G",
    status: "active",
    source: "api",
  });
  const outlook = {
    season: "E1999",
    ruleset: "euroleague",
    player: outlookPlayer.id,
    outlook_5: 1234,
    games_ahead: 5,
    role: "starter",
    base_source: "current",
    computed_at: new Date().toISOString(),
  };
  const outlookRow = await make("player_outlooks", outlook);
  check(
    (await carolClient.collection("player_outlooks").getOne(outlookRow.id)).outlook_5 === 1234,
    "any signed-in user reads an outlook",
  );
  check(
    await rejects(() => make("player_outlooks", { ...outlook, ruleset: "basketnews" }, aliceClient)),
    "a member cannot write an outlook",
  );
  check(
    await rejects(() => make("player_outlooks", outlook)),
    "a second outlook for the same season, ruleset and player is refused",
  );

  const sourceQuestion = {
    provider: "basketnews",
    season: "E2026",
    source_id: "6ad4b3ef16f8030eda89f4c9",
    details: { firstName: "Christian", lastName: "Koloko" },
    leagues: [league.id],
    status: "pending",
  };
  const sourceRow = await make("source_player_questions", sourceQuestion);
  check(
    await rejects(() => make("source_player_questions", sourceQuestion)),
    "source identities are unique by provider, season and source id",
  );
  check(
    await rejects(() => aliceClient.collection("source_player_questions").getOne(sourceRow.id)),
    "source approval intents are server-only",
  );
  check(
    await rejects(() => make("source_player_questions", sourceQuestion, aliceClient)),
    "a manager cannot bypass the source approval server action",
  );

  const rosterIntent = {
    league: league.id,
    season: "E2026",
    round: 7,
    target_hash: "verify-target",
    target: [[aliceMember.id, [playerOne.id]]],
    steps: [],
    status: "applying",
    at: new Date().toISOString(),
  };
  const rosterRow = await make("basketnews_roster_batches", rosterIntent);
  check(
    await rejects(() => make("basketnews_roster_batches", rosterIntent)),
    "a roster target has only one durable journal",
  );
  check(
    (await aliceClient.collection("basketnews_roster_batches").getOne(rosterRow.id)).id === rosterRow.id,
    "league members can read roster progress",
  );
  check(
    await rejects(() => carolClient.collection("basketnews_roster_batches").getOne(rosterRow.id)),
    "another league cannot read roster progress",
  );
  check(
    await rejects(() =>
      aliceClient.collection("basketnews_roster_batches").update(rosterRow.id, { status: "applied" }),
    ),
    "members cannot advance the roster journal",
  );

  const sourceTransaction = dealOf({
    type: "drop",
    from_round: 7,
    date: new Date().toISOString(),
    members: [aliceMember.id],
    players_in: {},
    players_out: { [aliceMember.id]: [playerOne.id] },
    note: "BasketNews verification",
    source_provider: "basketnews",
    source_event_id: "verify-event",
    source_leg: "drop",
  });
  await make("transactions", sourceTransaction);
  check(
    await rejects(() => make("transactions", sourceTransaction)),
    "a source transfer leg cannot be recorded twice",
  );
} finally {
  for (const collection of CLEANUP_ORDER) {
    for (const id of created[collection]) {
      await su.collection(collection).delete(id).catch(() => {});
    }
  }
}

console.log(
  failures === 0 ? "\nAll rule and index checks passed." : `\n${failures} check(s) FAILED.`,
);
process.exit(failures === 0 ? 0 : 1);
