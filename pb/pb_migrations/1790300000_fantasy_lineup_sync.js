/// <reference path="../pb_data/types.d.ts" />

// Fantasy Challenge lineup sync — round lineups read from the official game.
//
// - `round_lineups.source` gains `synced`: a lineup the sync wrote, so the
//   lineup page can say it came from the official game. Scoring reads every
//   stored row the same way whatever its source.
// - `fantasy_syncs.kind`: `rosters` or `lineups`. The roster schedule throttles
//   on its own runs only, so a lineup pass cannot delay a roster apply. Empty on
//   rows written before this, which are all roster runs.
//
// Rollback: drop `kind`, and remove `synced` (only safe once no row holds it).
migrate(
  (app) => {
    const lineups = app.findCollectionByNameOrId("round_lineups");
    lineups.fields.getByName("source").values = ["recorded", "carried", "absent", "synced"];
    app.save(lineups);

    const syncs = app.findCollectionByNameOrId("fantasy_syncs");
    syncs.fields.add(new Field({ name: "kind", type: "select", maxSelect: 1, values: ["rosters", "lineups"] }));
    app.save(syncs);
  },
  (app) => {
    const syncs = app.findCollectionByNameOrId("fantasy_syncs");
    const kind = syncs.fields.getByName("kind");
    if (kind) syncs.fields.removeById(kind.id);
    app.save(syncs);

    const lineups = app.findCollectionByNameOrId("round_lineups");
    lineups.fields.getByName("source").values = ["recorded", "carried", "absent"];
    app.save(lineups);
  },
);
