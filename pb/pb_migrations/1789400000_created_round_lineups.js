/// <reference path="../pb_data/types.d.ts" />

// Phase 9.3 — `round_lineups`: who started, who was captain, who sat.
//
// Official Draft Mode keeps Classic Mode's captain ×2 and bench ×50%. The
// multiplier is applied when standings are computed, never baked into
// `player_game_stats`: one box-score row serves every league, so a per-league
// lineup written into it would be wrong the moment two leagues arrange the
// same player differently.
//
// `slots` is one JSON payload — `{ starters, captain, sixth, bench, inactive }`
// as player ids — deliberately. PocketBase has no transactions, so a lineup
// that landed half-written would be a lineup that scores wrongly; one field
// means one atomic write and there is no half-state to repair.
//
// `source` is `recorded` for everything written here. `carried` and `absent`
// are what the reader resolves for rounds nobody typed (carry the last lineup
// forward; before any lineup, score everyone at 100% and strike the round as
// provisional), and they are in the vocabulary so materializing them later is
// a write rather than a migration.
//
// Unique `(league, member, season, round)` is the physical backstop: a double
// submit updates the round's lineup rather than scoring it twice.
//
// Rollback: drop the collection. Standings recompute back to 100% rounds.

migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");
    const members = app.findCollectionByNameOrId("league_members");
    const users = app.findCollectionByNameOrId("users");

    const inLeague =
      "@collection.league_members:mine.league ?= league && " +
      "@collection.league_members:mine.user ?= @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "round_lineups",
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
          name: "member",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: members.id,
          cascadeDelete: true,
        },
        { name: "season", type: "text", required: true, max: 12 },
        {
          name: "round",
          type: "number",
          required: true,
          onlyInt: true,
          min: 1,
        },
        { name: "slots", type: "json", required: true, maxSize: 6000 },
        {
          name: "source",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["recorded", "carried", "absent"],
        },
        {
          name: "recorded_by",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: users.id,
          cascadeDelete: false,
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_round_lineups_member_round` ON `round_lineups` (`league`, `member`, `season`, `round`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("round_lineups"));
  },
);
