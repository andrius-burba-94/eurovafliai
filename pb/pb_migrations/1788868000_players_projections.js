/// <reference path="../pb_data/types.d.ts" />

// Slice 4.4 — last-5 and season fantasy averages, materialized onto `players`.
//
// Derived cache, not a source of truth. Box scores stay in `player_game_stats`;
// these four numbers are what autodraft and the pool filter read so they do
// not average ~9,000 rows on every pick. Recompute after each ingest (and via
// `npm run stats:project`); a crash between the two leaves stale averages, and
// running the recompute again is the repair.
//
// Integer tenths, same as `fantasy_pts`. None of these are `required`: a
// genuine average of 0 is a real number, and PocketBase's required check is a
// truthy test that would refuse it. Absence is `proj_last5_games === 0`, not a
// 0 average — unset numbers store as 0, and an unprojected player must not
// outrank someone projected at −2.
//
// No unique indexes: these are quantities, and a unique index on a number
// alone is the 0-collision trap the skill already names.

migrate(
  (app) => {
    const players = app.findCollectionByNameOrId("players");

    for (const name of [
      "proj_last5_fantasy",
      "proj_last5_games",
      "proj_season_fantasy",
      "proj_season_games",
    ]) {
      players.fields.add(
        new Field({
          name,
          type: "number",
          onlyInt: true,
        }),
      );
    }

    app.save(players);
  },
  (app) => {
    const players = app.findCollectionByNameOrId("players");
    for (const name of [
      "proj_last5_fantasy",
      "proj_last5_games",
      "proj_season_fantasy",
      "proj_season_games",
    ]) {
      const field = players.fields.getByName(name);
      if (field) players.fields.removeById(field.id);
    }
    app.save(players);
  },
);
