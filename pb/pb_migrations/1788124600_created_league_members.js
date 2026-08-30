/// <reference path="../pb_data/types.d.ts" />

// Phase 1.1 — the `league_members` collection.
//
// One row per participant per league: their team name, their draft position
// once the roll has happened, and whether autodraft is armed for them.
//
// unique(league, user) is the physical backstop against a double join — two
// simultaneous "join with invite code" requests both passing validation cannot
// both write. PocketBase has no transactions; see docs/adr/ADR-0003.
migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");
    const users = app.findCollectionByNameOrId("users");

    // Own row only at creation time: a rule cannot reference the collection
    // being created in the same save. Migration 1788124700_league_read_rules.js
    // widens this to "every member of a league you belong to".
    const readable = "user = @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "league_members",
      listRule: readable,
      viewRule: readable,
      // Superuser-only: joining, renaming and kicking are server actions.
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "league",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: leagues.id,
          // A deleted league takes its memberships with it.
          cascadeDelete: true,
        },
        {
          name: "user",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: true,
        },
        // Set by the member or the commissioner; absent until someone names it.
        { name: "team_name", type: "text", max: 40 },
        // Unset until the roll. Deliberately NOT required: PocketBase stores an
        // unset number as 0 and its required check is a truthy test that runs
        // before type validation, so `required: true` would reject legitimate
        // values and unset alike. Range is enforced here, presence in code.
        {
          name: "draft_position",
          type: "number",
          required: false,
          onlyInt: true,
          min: 1,
          max: 12,
        },
        { name: "autodraft_enabled", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_league_members_league_user` ON `league_members` (`league`, `user`)",
        // The lobby and the draft both read "members of this league, in order".
        "CREATE INDEX `idx_league_members_league` ON `league_members` (`league`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("league_members"));
  },
);
