/// <reference path="../pb_data/types.d.ts" />

// Slice 10.6 — the five games behind the last-5 average, unaveraged.
//
// `proj_last5_pir` has been the displayed and ranked number since 9.1, and it is
// a mean: it cannot say whether 14.0 is five steady games or two 30s and three
// blanks. The sparkline needs the values themselves, and nothing in the app has
// ever stored them — `projectPlayer` computed `played.slice(-LAST5)` and threw
// the per-game numbers away after averaging.
//
// One json column rather than five numeric ones, for the same reason
// `prev_season_stats` is json: it is read by the row that draws it and by
// nothing else, so it is never filtered or sorted on, and five nullable
// `proj_last5_pir_1..5` columns would invite exactly the questions ("is _3 zero
// or absent?") this shape answers by construction.
//
// Whole numbers, not tenths. A stored `pir` is whole; the *average* is tenths
// because an average of whole numbers is not one, and that argument does not
// reach the values themselves.
//
// Not `required`, like every other derived field on this collection. And the
// rule 4.4 and 9.1 both state still holds — **absence is the games count, never
// the value** — with one addition this field makes possible: an empty array is
// genuinely distinguishable from a real run of zeros, which a numeric column
// could never be. `recomputeProjections` keeps `proj_last5_pirs.length ===
// proj_last5_games` so the two can never tell different stories.
//
// maxSize is generous for five small integers on purpose: it is a cap against a
// runaway write, not a fit to the expected payload.

migrate(
  (app) => {
    const players = app.findCollectionByNameOrId("players");

    players.fields.add(
      new Field({ name: "proj_last5_pirs", type: "json", maxSize: 256 }),
    );

    app.save(players);
  },
  (app) => {
    const players = app.findCollectionByNameOrId("players");
    const field = players.fields.getByName("proj_last5_pirs");
    if (field) players.fields.removeById(field.id);
    app.save(players);
  },
);
