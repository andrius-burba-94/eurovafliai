/// <reference path="../pb_data/types.d.ts" />

// The game page's scoreboard: each club's place in the official Euroleague
// table and its win–loss record. One row per season holding the latest table
// (`clubs`: [{ code, position, played, won, lost }]), written by the worker from
// the feed's `basicstandings`. Signed-in clients read; only the worker writes.
// The unique season index makes a retried pass an update, not a second table;
// a failed write leaves the previous table, still right until the next result.
// Rollback drops only this derived collection.
migrate(
  (app) => {
    const signedIn = '@request.auth.id != ""';
    app.save(new Collection({
      type: "base",
      name: "club_standings",
      listRule: signedIn,
      viewRule: signedIn,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "season", type: "text", required: true, max: 12 },
        { name: "round", type: "number", required: true, onlyInt: true, min: 1 },
        { name: "clubs", type: "json", maxSize: 16384 },
        { name: "checked_at", type: "text", required: true, max: 40 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: ["CREATE UNIQUE INDEX `idx_club_standings_season` ON `club_standings` (`season`)"],
    }));
  },
  (app) => app.delete(app.findCollectionByNameOrId("club_standings")),
);
