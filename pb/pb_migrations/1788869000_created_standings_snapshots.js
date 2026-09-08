/// <reference path="../pb_data/types.d.ts" />

// Phase 4.5 — `standings_snapshots`: a per-round cache of the table, not the
// table of record.
//
// The scores live in `player_game_stats`. A member's squad is their active
// `roster_memberships` rows (materialized from the newest complete draft on
// finish, and repaired by recompute if that loop was lost). Recompute joins
// those two, writes one row per (league, season, round), and the standings
// page reads the cache. A crash between ingest and this write leaves stale
// (or missing) snapshots; the next ingest or `npm run standings:recompute`
// is the repair — the same story 4.4 told for projections.
//
// `table` is JSON: ranked `{ memberId, totalTenths, roundTenths }`. Totals
// are integer tenths so a season of them cannot accumulate a float. Unique
// `(league, season, round)` is the physical backstop that makes a re-run an
// upsert rather than a second copy of round 4.

migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");

    const inLeague =
      "@collection.league_members:mine.league ?= league && " +
      "@collection.league_members:mine.user ?= @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "standings_snapshots",
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
        { name: "season", type: "text", required: true, max: 12 },
        {
          name: "round",
          type: "number",
          required: true,
          onlyInt: true,
          min: 1,
        },
        {
          name: "phase",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["RS", "PI", "PO", "FF"],
        },
        { name: "table", type: "json", required: true },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_standings_snapshots_league_season_round` ON `standings_snapshots` (`league`, `season`, `round`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("standings_snapshots"));
  },
);
