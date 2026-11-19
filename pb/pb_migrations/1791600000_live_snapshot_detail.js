/// <reference path="../pb_data/types.d.ts" />

// Live box score: the game page draws each period's points and the game clock.
// One optional json field on live_game_snapshots, `detail`:
// `{ quarters: { local: [], road: [] }, period, clock }`, written by the worker
// alongside `players`. Optional because every snapshot written before it has
// none, and the page reads a missing detail as "no clock yet". No rule or index
// changes: it is read with the row it belongs to. Rollback removes the field;
// the players and scores beside it are untouched.
migrate(
  (app) => {
    const snapshots = app.findCollectionByNameOrId("live_game_snapshots");
    snapshots.fields.add(new Field({ name: "detail", type: "json", maxSize: 4096 }));
    app.save(snapshots);
  },
  (app) => {
    const snapshots = app.findCollectionByNameOrId("live_game_snapshots");
    snapshots.fields.removeById(snapshots.fields.getByName("detail").id);
    app.save(snapshots);
  },
);
