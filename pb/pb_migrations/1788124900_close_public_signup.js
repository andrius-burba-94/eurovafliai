/// <reference path="../pb_data/types.d.ts" />

// Close public sign-up on `users` (issue #3, deferred from slice 1.2).
//
// Eurovafliai is invite-based and Google is the only door. Until now `users`
// carried `createRule: ""` — an empty rule means *anyone*, so any client that
// could reach the API was able to POST a new account, and `passwordAuth` was
// still enabled so it could then log in with a password. Locally that was
// screened by PocketBase binding to 127.0.0.1; it must be shut before the
// deploy slice exposes /pb/ to the internet.
//
// WHY NOT `createRule: null`
//
// The obvious move — lock creation to superusers — breaks the product. A
// first-time Google sign-in has no `users` record yet, so the OAuth2 handler
// creates one, and it does that through an ordinary internal record-create
// request that IS subject to `createRule`. Setting it to null would let
// existing members log in while every new member got a permission error on the
// one night that cannot be debugged: draft night.
//
// PocketBase's answer is `@request.context`, added in v0.22.0 for exactly this
// ("restricting user creation via OAuth2"). Its values are `default`,
// `realtime`, `protectedFile` and `oauth2`. So:
//
//   createRule = '@request.context = "oauth2"'
//
// A direct POST to /api/collections/users/records runs in the `default`
// context and is refused. The record PocketBase creates while completing a
// Google sign-in runs in the `oauth2` context and is allowed. Public sign-up
// closed, first-time sign-in intact, no pb_hooks handler needed.
//
// `passwordAuth` goes off in the same migration: with sign-up closed there is
// no way to set a password, so leaving the password endpoint enabled only
// leaves an attack surface (credential stuffing against the generated
// passwords OAuth2 writes). It also removes the temptation to add a
// password-based back door later.
//
// Consequence for tooling, handled in this PR: scripts/pb-verify-rules.mjs
// authenticated its throwaway users with authWithPassword. It now uses
// superuser impersonate() instead.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    unmarshal({ createRule: '@request.context = "oauth2"' }, users);
    users.passwordAuth.enabled = false;
    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    // Back to the PocketBase default for an auth collection: creation open,
    // password auth on.
    unmarshal({ createRule: "" }, users);
    users.passwordAuth.enabled = true;
    app.save(users);
  },
);
