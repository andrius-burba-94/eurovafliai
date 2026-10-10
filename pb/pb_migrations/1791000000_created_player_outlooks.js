/// <reference path="../pb_data/types.d.ts" />

// Slice 7.2 E — each player's outlook, per ruleset, written by the worker.
//
// One row per (season, ruleset, player): what he should score a game over his
// club's next 5, 10 and 15 games, in hundredths of that ruleset's points
// (fantasy points for `euroleague`, Modern points for `basketnews`). The
// advisor computes it; nothing here is a judgement.
//
// PocketBase stores an unset number as 0, so `games_ahead` says whether the
// figures mean anything: 0 games ahead means the club has no game left, and
// every outlook is absent rather than zero. A player with no game in either
// season has no row at all — the waiver wire prints him as "no games yet".
//
// Readable by any signed-in user: the waiver wire is the same for everyone.
// Written by the superuser only. unique(season, ruleset, player) is the
// backstop for two passes racing; a pass is an upsert, so a pass that dies
// halfway leaves each row old or new and the next pass rewrites them all.
//
// Rollback: drop the collection. It is derived; the next pass rebuilds it.

const signedIn = '@request.auth.id != ""';
const RUNS = ["easy", "even", "hard"];

migrate(
  (app) => {
    const players = app.findCollectionByNameOrId("players");
    const outlooks = new Collection({
      type: "base",
      name: "player_outlooks",
      listRule: signedIn,
      viewRule: signedIn,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "season", type: "text", required: true, max: 12 },
        { name: "ruleset", type: "select", required: true, maxSelect: 1, values: ["euroleague", "basketnews"] },
        { name: "player", type: "relation", required: true, maxSelect: 1, collectionId: players.id, cascadeDelete: true },
        { name: "outlook_5", type: "number", onlyInt: true },
        { name: "outlook_10", type: "number", onlyInt: true },
        { name: "outlook_15", type: "number", onlyInt: true },
        { name: "games_ahead", type: "number", onlyInt: true, min: 0 },
        { name: "role", type: "select", required: true, maxSelect: 1, values: ["starter", "reserve"] },
        { name: "games_in_role", type: "number", onlyInt: true, min: 0 },
        { name: "base_source", type: "select", required: true, maxSelect: 1, values: ["current", "last"] },
        { name: "run_5", type: "select", maxSelect: 1, values: RUNS },
        { name: "run_10", type: "select", maxSelect: 1, values: RUNS },
        { name: "run_15", type: "select", maxSelect: 1, values: RUNS },
        { name: "computed_at", type: "date", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_player_outlooks_key` ON `player_outlooks` (`season`, `ruleset`, `player`)",
      ],
    });
    app.save(outlooks);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("player_outlooks"));
  },
);
