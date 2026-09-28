/// <reference path="../pb_data/types.d.ts" />

// `players_in` / `players_out` may be empty. A drop has nobody arriving and
// an add has nobody leaving, so each writes `{}` on one side — and PocketBase
// treats `{}` as blank for a required JSON field. With both required, every
// add and drop was refused at the database; only trades could be recorded.
// `members` stays required: every transaction names at least one team.
//
// Rollback: make both required again (only safe once no add or drop exists).

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("transactions");
    collection.fields.getByName("players_in").required = false;
    collection.fields.getByName("players_out").required = false;
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("transactions");
    collection.fields.getByName("players_in").required = true;
    collection.fields.getByName("players_out").required = true;
    app.save(collection);
  },
);
