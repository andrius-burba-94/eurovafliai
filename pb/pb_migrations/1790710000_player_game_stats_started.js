/// <reference path="../pb_data/types.d.ts" />

// Slice 7.0: who started each game, from the v2 box score's `startFive`.
// One optional select on player_game_stats: "yes", "no", or empty for unknown
// (a CSV line, a season before the field, or a side that did not list exactly
// five). Not required, because empty is a real answer. No index: it is read
// with the rows it describes. Rollback removes the field; no other data moves.
migrate(
  (app) => {
    const stats = app.findCollectionByNameOrId("player_game_stats");
    stats.fields.add(new Field({ name: "started", type: "select", maxSelect: 1, values: ["yes", "no"] }));
    app.save(stats);
  },
  (app) => {
    const stats = app.findCollectionByNameOrId("player_game_stats");
    stats.fields.removeById(stats.fields.getByName("started").id);
    app.save(stats);
  },
);
