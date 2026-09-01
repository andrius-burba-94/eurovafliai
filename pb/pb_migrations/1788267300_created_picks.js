/// <reference path="../pb_data/types.d.ts" />

// Phase 2.4 — `picks`, and the two indexes the whole draft rests on.
//
// ADR-0003 in one collection. PocketBase has no transactions, so making a pick
// is validate-then-write and the validation can be raced: two clients, or a
// client and the worker's autodraft, can both read "slot 14 is free" in the
// same instant and both write. An index cannot be raced.
//
//   unique(draft, overall_no) — one pick per slot. A race cannot double-fill a
//                               turn; the loser gets a clean error.
//   unique(draft, player)     — a player cannot be drafted twice in one draft.
//
// These are not an optimisation and they are not redundant with the code that
// checks the same things. They are the reason a double pick is *impossible*
// rather than *unlikely*, and removing one is a correctness regression, not a
// cleanup (see the pocketbase-patterns skill).
//
// Both are composite and include a relation, which is what makes them safe:
// PocketBase stores an unset number as 0, so a unique index on `overall_no`
// alone would collide across drafts and on unset values.
//
// `is_auto` records that the worker picked for an absent member. Not
// `required` — a bool's required check is a truthy test that would reject
// `false`, the value meaning "a human picked this".
migrate(
  (app) => {
    const drafts = app.findCollectionByNameOrId("drafts");
    const members = app.findCollectionByNameOrId("league_members");
    const players = app.findCollectionByNameOrId("players");

    const readable =
      "@collection.league_members:mine.league ?= draft.league && " +
      "@collection.league_members:mine.user ?= @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "picks",
      // Everyone in the league sees every pick — that is the board.
      listRule: readable,
      viewRule: readable,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "draft",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: drafts.id,
          cascadeDelete: true,
        },
        // 1-based across the whole draft, 1…(members × rounds).
        {
          name: "overall_no",
          type: "number",
          required: false,
          onlyInt: true,
          min: 1,
        },
        { name: "round", type: "number", required: false, onlyInt: true, min: 1 },
        { name: "slot", type: "number", required: false, onlyInt: true, min: 1 },
        {
          name: "member",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: members.id,
          // A membership removed mid-draft would take its picks with it, which
          // would tear a hole in the board. Kicking is refused once a draft is
          // running, and this is the backstop for that rule.
          cascadeDelete: false,
        },
        {
          name: "player",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: players.id,
          cascadeDelete: false,
        },
        { name: "is_auto", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_picks_draft_overall` ON `picks` (`draft`, `overall_no`)",
        "CREATE UNIQUE INDEX `idx_picks_draft_player` ON `picks` (`draft`, `player`)",
        // The board reads "every pick in this draft, in order", constantly.
        "CREATE INDEX `idx_picks_draft` ON `picks` (`draft`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("picks"));
  },
);
