/// <reference path="../pb_data/types.d.ts" />

// BasketNews positions belong beside, not over, EuroLeague player positions.
// Adds one optional players field; existing player-id reads and indexes suffice.
// Rollback removes the source position field without changing either roster.
migrate(
  (app) => {
    const players = app.findCollectionByNameOrId("players");
    players.fields.add(new Field({ name: "basketnews_position", type: "select", maxSelect: 1, values: ["G", "F", "C"] }));
    app.save(players);
  },
  (app) => {
    const players = app.findCollectionByNameOrId("players");
    players.fields.removeById(players.fields.getByName("basketnews_position").id);
    app.save(players);
  },
);
