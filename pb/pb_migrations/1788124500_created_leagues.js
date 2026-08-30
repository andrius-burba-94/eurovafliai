/// <reference path="../pb_data/types.d.ts" />

// Phase 1.1 — the `leagues` collection.
//
// A league is one private competition: a commissioner, its members, its
// settings. See docs/EUROVAFLIAI_BLUEPRINT.md §4 and CONTEXT.md.
//
// Writes are superuser-only (create/update/delete rules are null): every write
// goes through a Next server action using the superuser client. Reads use the
// user's token, so the list/view rules below are real defense-in-depth — a
// member can only ever read a league they belong to.
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId("users");

    // Only the commissioner can read a league at this point. The member rule
    // needs `league_members`, which does not exist yet — a rule referencing a
    // missing collection fails validation on save. Migration
    // 1788124700_league_read_rules.js widens both collections once both exist.
    const readable = "commissioner = @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "leagues",
      listRule: readable,
      viewRule: readable,
      // Superuser-only. Server actions own every write.
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "name", type: "text", required: true, min: 2, max: 60 },
        // Euroleague season label as the league says it, e.g. "2026-27".
        { name: "season", type: "text", required: true, max: 16 },
        {
          name: "commissioner",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          // Losing a user must never delete the league they ran.
          cascadeDelete: false,
        },
        // Shared out-of-band ("join with code EURO26"). Unique index below.
        { name: "invite_code", type: "text", required: true, min: 6, max: 16 },
        // Scoring weights, roster_template {G:5,F:5,C:3}, trade rules.
        // Required so a league cannot exist without a roster template; the
        // creating server action always supplies it.
        { name: "settings", type: "json", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          // setup: lobby open · drafting: a draft is running ·
          // season: drafted, tracking games · complete: season over.
          values: ["setup", "drafting", "season", "complete"],
        },
        // PocketBase does not add these to base collections. We need them.
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_leagues_invite_code` ON `leagues` (`invite_code`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("leagues"));
  },
);
