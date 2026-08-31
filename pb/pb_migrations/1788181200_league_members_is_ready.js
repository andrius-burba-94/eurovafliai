/// <reference path="../pb_data/types.d.ts" />

// Phase 1.3b — `is_ready` on `league_members`.
//
// The lobby is where members "gather, get named, and are marked ready"
// (CONTEXT.md). Naming already had a home in `team_name`; readiness did not,
// which is why slice 1.3a deferred it — the field needs a migration and that
// PR was large enough already.
//
// A bool, defaulting to false. No `required`: PocketBase's required check is a
// truthy test, so `required: true` on a bool would reject `false` — the very
// value that means "not ready yet". The same shape of trap as `draft_position`
// in 1788124600, for the same reason.
//
// Readiness is an attestation, so only the member themselves sets it — the
// server action refuses on anyone else's row, commissioner included. The
// commissioner's lobby powers are renaming and kicking. Nothing depends on
// readiness yet: it tells the room who has their phone out, and Phase 2.3
// decides what, if anything, it gates when the draft is actually started.
//
// Writes stay superuser-only, like every other field on this collection.
migrate(
  (app) => {
    const members = app.findCollectionByNameOrId("league_members");

    members.fields.add(
      new Field({
        name: "is_ready",
        type: "bool",
      }),
    );

    app.save(members);
  },
  (app) => {
    const members = app.findCollectionByNameOrId("league_members");

    const field = members.fields.getByName("is_ready");
    if (field) members.fields.removeById(field.id);

    app.save(members);
  },
);
