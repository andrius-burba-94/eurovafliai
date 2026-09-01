/// <reference path="../pb_data/types.d.ts" />

// `can_manage` on `league_members` — the commissioner's deputies.
//
// The rule the league asked for: the commissioner owns changes to the league
// and to the roster, and may grant that to specific members. Everything up to
// now had exactly one privileged person, which is fine until the commissioner
// is the one on a train when a roster needs fixing.
//
// A bool, defaulting to false, and NOT `required`: PocketBase's required check
// is a truthy test, so `required: true` would reject `false` — the value that
// means "not a deputy". The same trap as `draft_position` in 1788124600,
// `is_ready` in 1788181200 and `manual_lock` in 1788181300.
//
// The commissioner's own authority is NOT stored here. It is derived from
// `leagues.commissioner`, so there is one source of truth for it and no way for
// the two to disagree — a commissioner whose `can_manage` row said false would
// be a state nothing could explain.
//
// Only the commissioner may set this field, which is enforced in the server
// action rather than by a rule: writes to this collection are already
// superuser-only, so the API rule cannot see who is asking.
migrate(
  (app) => {
    const members = app.findCollectionByNameOrId("league_members");

    members.fields.add(
      new Field({
        name: "can_manage",
        type: "bool",
      }),
    );

    app.save(members);
  },
  (app) => {
    const members = app.findCollectionByNameOrId("league_members");
    const field = members.fields.getByName("can_manage");
    if (field) members.fields.removeById(field.id);
    app.save(members);
  },
);
