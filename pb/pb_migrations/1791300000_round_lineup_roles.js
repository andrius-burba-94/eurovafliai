/// <reference path="../pb_data/types.d.ts" />

// Frozen roles: each player's role as the sync read it on his own game day.
//
// `slots` stays the lineup as it stands now; `roles` holds
// `{ [playerId]: { role, day, at } }` for every player whose game day a sync
// read has reached, and scoring reads it first. Same row, same unique index,
// so a write still lands whole or not at all.
//
// Rollback drops the field: rounds score from `slots` alone, as before.

migrate(
  (app) => {
    const lineups = app.findCollectionByNameOrId("round_lineups");
    lineups.fields.add(new Field({ name: "roles", type: "json", maxSize: 8000 }));
    app.save(lineups);
  },
  (app) => {
    const lineups = app.findCollectionByNameOrId("round_lineups");
    lineups.fields.removeById(lineups.fields.getByName("roles").id);
    app.save(lineups);
  },
);
