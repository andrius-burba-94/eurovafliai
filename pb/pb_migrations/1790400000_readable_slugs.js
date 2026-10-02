/// <reference path="../pb_data/types.d.ts" />

// S28 — readable URLs: `slug` on `leagues`, `league_members` and `players`.
//
// URLs become /l/<league>/<team> and /l/<league>/players/<player> instead of
// record ids. Each slug is generated in TypeScript (`src/lib/slugs/slug.ts`)
// on create and rename and by an idempotent backfill (`ensureSlugs`, run by
// the worker at start and by `npm run slugs:backfill`). Until a record has
// one, links use its id and an id in a URL still resolves, so an empty slug
// is never a broken page.
//
// Indexes, all partial on `slug != ''` so the many rows without one yet do not
// collide on the empty string:
// - `leagues(slug)` unique: /l/<slug> names one league.
// - `league_members(league, slug)` unique: a team's slug is unique in its
//   league only, so two leagues can each have "vaflininkai".
// - `players(slug)` unique: a player's page is league-independent.
//
// No rule changes: writes stay superuser-only. Rollback drops the fields and
// the indexes; links fall back to ids.
migrate(
  (app) => {
    const specs = [
      ["leagues", "CREATE UNIQUE INDEX `idx_leagues_slug` ON `leagues` (`slug`) WHERE `slug` != ''"],
      ["league_members", "CREATE UNIQUE INDEX `idx_league_members_slug` ON `league_members` (`league`, `slug`) WHERE `slug` != ''"],
      ["players", "CREATE UNIQUE INDEX `idx_players_slug` ON `players` (`slug`) WHERE `slug` != ''"],
    ];
    for (const [name, index] of specs) {
      const collection = app.findCollectionByNameOrId(name);
      if (!collection.fields.getByName("slug")) {
        collection.fields.add(new Field({ name: "slug", type: "text", max: 80, pattern: "^[a-z0-9-]*$" }));
      }
      collection.indexes = [...collection.indexes.filter((existing) => !existing.includes("_slug`")), index];
      app.save(collection);
    }
  },
  (app) => {
    for (const name of ["leagues", "league_members", "players"]) {
      const collection = app.findCollectionByNameOrId(name);
      collection.indexes = collection.indexes.filter((existing) => !existing.includes("_slug`"));
      const field = collection.fields.getByName("slug");
      if (field) collection.fields.removeById(field.id);
      app.save(collection);
    }
  },
);
