/// <reference path="../pb_data/types.d.ts" />

// Phase 5.2 — `transactions`: a recorded trade, add or drop.
//
// Friends negotiate out loud (blueprint D10). This collection stores the
// result, not an offer. Writes are superuser-only; reads are in-league, same
// `league_members:mine` idiom as memberships. There is no unique on the
// payload: two identical-looking trades a week apart are legal. Repair is
// idempotent apply against membership windows, not a unique insert.
//
// `from_round` is the first Euroleague round the new squad counts. Required
// with min 1 — 0 is not a round (PocketBase stores unset numbers as 0, so a
// required field here also stops an accidental blank).
//
// `members`, `players_in` and `players_out` are JSON keyed by membership id:
// who left whom, who arrived where. Cascade on `league` so deleting a league
// takes the record with it.
//
// Rollback: drop the collection.

migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");

    const inLeague =
      "@collection.league_members:mine.league ?= league && " +
      "@collection.league_members:mine.user ?= @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "transactions",
      listRule: inLeague,
      viewRule: inLeague,
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
          cascadeDelete: true,
        },
        {
          name: "type",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["trade", "add", "drop"],
        },
        { name: "date", type: "date", required: true },
        {
          name: "from_round",
          type: "number",
          required: true,
          onlyInt: true,
          min: 1,
        },
        { name: "members", type: "json", required: true, maxSize: 4000 },
        { name: "players_in", type: "json", required: true, maxSize: 20000 },
        { name: "players_out", type: "json", required: true, maxSize: 20000 },
        { name: "note", type: "text", max: 500 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX `idx_transactions_league_round` ON `transactions` (`league`, `from_round`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("transactions"));
  },
);
