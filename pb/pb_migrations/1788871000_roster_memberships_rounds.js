/// <reference path="../pb_data/types.d.ts" />

// Phase 5.2 — round windows on `roster_memberships`.
//
// Standings must split a player's nights at a trade without using calendar
// `from_date`: box scores have `season` + `round`, no game date, and a
// September 2026 draft date would drop every E2025 backfill line. `from_round`
// is inclusive; `to_round` is exclusive and 0 means still open. Both are
// optional numbers (never `required`: a legitimate 0 on `to_round` would fail
// PocketBase's truthy required check).
//
// Draft materialize writes `from_round = 1` and `to_round = 0`. A close sets
// `to_round` to the transaction's first counting round.
//
// Rollback: drop the two fields. Historical rows without them still read as
// "from round 1, open" in application code.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("roster_memberships");
    collection.fields.add(
      new Field({
        name: "from_round",
        type: "number",
        onlyInt: true,
        min: 0,
      }),
    );
    collection.fields.add(
      new Field({
        name: "to_round",
        type: "number",
        onlyInt: true,
        min: 0,
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("roster_memberships");
    for (const name of ["from_round", "to_round"]) {
      const field = collection.fields.getByName(name);
      if (field) collection.fields.removeById(field.id);
    }
    app.save(collection);
  },
);
