/// <reference path="../pb_data/types.d.ts" />

// Phase 1.1 — Google OAuth2 on the `users` auth collection.
//
// Google is the only way into Eurovafliai. The app uses the *manual code flow*
// (`authWithOAuth2Code`) so the session lands in an httpOnly cookie managed by
// Next server actions, rather than in browser storage — the login slice (1.2)
// builds that half.
//
// Credentials come from the environment at apply time, never from this file.
// `npm run pb:serve` sources .env so they are visible here; on the VPS they come
// from the systemd unit. If they are absent the migration still records the
// auth rule and leaves OAuth2 untouched, so CI and a fresh checkout apply it
// cleanly instead of failing.
//
// Deliberately NOT changed here: `createRule` and `passwordAuth`. Closing public
// sign-up is an auth-policy change that can only be verified against a real
// Google round-trip, so it belongs to slice 1.2 with a test behind it. Until
// then PocketBase is bound to 127.0.0.1 and nothing is deployed.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // Any account that exists may authenticate. Membership, not account
    // existence, is what gates a league (you still need an invite code).
    users.authRule = 'id != ""';

    const clientId = $os.getenv("GOOGLE_CLIENT_ID");
    const clientSecret = $os.getenv("GOOGLE_CLIENT_SECRET");

    if (clientId && clientSecret) {
      // Replace rather than append, so re-applying against an existing provider
      // cannot leave two "google" entries behind.
      const others = (users.oauth2.providers || []).filter(
        (p) => p.name !== "google",
      );
      users.oauth2.enabled = true;
      users.oauth2.providers = [
        ...others,
        { name: "google", clientId: clientId, clientSecret: clientSecret },
      ];
    } else {
      console.log(
        "[migration] GOOGLE_CLIENT_ID/SECRET not set — auth rule applied, " +
          "Google OAuth2 left disabled. Set them and re-run this migration " +
          "(or configure the provider) before login can work.",
      );
    }

    app.save(users);
  },
  (app) => {
    const users = app.findCollectionByNameOrId("users");
    users.authRule = "";
    users.oauth2.enabled = false;
    users.oauth2.providers = (users.oauth2.providers || []).filter(
      (p) => p.name !== "google",
    );
    app.save(users);
  },
);
