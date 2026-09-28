/// <reference path="../pb_data/types.d.ts" />

// Redesign matchday: one provisional snapshot per season and game.
// Signed-in clients can read and subscribe; only the worker writes. The unique
// season/game index makes a retried poll an upsert, not a second game. A failed
// write leaves the previous snapshot and its checked_at time visible as stale;
// the next poll repairs it. Rollback drops only this derived collection.
migrate(
  (app) => {
    const signedIn = '@request.auth.id != ""';
    app.save(new Collection({
      type: "base",
      name: "live_game_snapshots",
      listRule: signedIn,
      viewRule: signedIn,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "season", type: "text", required: true, max: 12 },
        { name: "game_code", type: "number", required: true, onlyInt: true, min: 1 },
        { name: "round", type: "number", required: true, onlyInt: true, min: 1 },
        { name: "live", type: "bool" },
        { name: "local_score", type: "number", onlyInt: true, min: 0 },
        { name: "road_score", type: "number", onlyInt: true, min: 0 },
        { name: "players", type: "json", maxSize: 131072 },
        { name: "checked_at", type: "text", required: true, max: 40 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_live_game` ON `live_game_snapshots` (`season`, `game_code`)",
        "CREATE INDEX `idx_live_round` ON `live_game_snapshots` (`season`, `round`)",
      ],
    }));
  },
  (app) => app.delete(app.findCollectionByNameOrId("live_game_snapshots")),
);
