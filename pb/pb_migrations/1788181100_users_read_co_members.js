/// <reference path="../pb_data/types.d.ts" />

// Phase 1.3b — let league members read each other's user records.
//
// `users` was still on PocketBase's default self-only read rules, so the lobby's
// `expand: "user"` returned nothing for anyone but the viewer and every other
// member rendered as "Unknown member" (issue #15). The fallback string was
// doing its job; the rule was the bug. Phase 1's own definition of done — two
// people join the same lobby and see each other — could not hold until this
// landed.
//
// The rule is a single back-relation CHAIN, rooted at the record being read:
//
//   the user's memberships -> their leagues -> those leagues' members -> me
//
// Rooting it at the read record is what makes it safe. Because it is one path
// rather than two independent conditions, every hop is bound to the one before
// it, so the league that connects us is necessarily the same league on both
// sides. Written instead as "this user belongs to some league AND I belong to
// some league", the two halves could be satisfied by different leagues and the
// collection would leak every user to anyone who had joined anything — the same
// `:alias` trap documented at length in 1788124700_league_read_rules.js, in its
// other guise.
//
// Verified rather than asserted: `npm run pb:verify` proves a co-member is
// readable, a stranger is not, and — the multi-hop case worth being paranoid
// about — that sharing a league with someone does NOT extend to *their* other
// leagues.
//
// Email is deliberately not part of this. PocketBase only returns `email` to
// the record's owner, a superuser, or when `emailVisibility` is true on the
// record, and none of those apply to a co-member. So widening the read rule
// exposes display names and avatars, not everyone's Google address. pb:verify
// asserts that too, because it is the kind of thing a later migration could
// undo without anyone noticing.
//
// Writes are untouched: `createRule` stays '@request.context = "oauth2"' (see
// 1788124900_close_public_signup.js), update and delete stay superuser-only.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    const readable =
      "id = @request.auth.id || " +
      "league_members_via_user.league.league_members_via_league.user " +
      "?= @request.auth.id";

    unmarshal({ listRule: readable, viewRule: readable }, users);
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // PocketBase's own default for a fresh auth collection: you, and nobody
    // else. Reverting restores the "Unknown member" behaviour by design.
    unmarshal(
      {
        listRule: "id = @request.auth.id",
        viewRule: "id = @request.auth.id",
      },
      users,
    );
    app.save(users);
  },
);
