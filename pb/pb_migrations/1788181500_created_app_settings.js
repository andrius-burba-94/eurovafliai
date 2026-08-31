/// <reference path="../pb_data/types.d.ts" />

// Phase 2.1 — `app_settings`, and the roster authority switch that lives on it.
//
// Decision D8 calls for "an app-level `roster_authority: api | csv` switch"
// deciding which source is allowed to write, while the other still runs in
// report-only mode. App-level, not per-league: `players` is one canonical table
// shared by every league, so the switch cannot hang off `leagues.settings`.
//
// SINGLETON BY CONSTRUCTION. The `singleton` field is always the literal
// "app" and carries a unique index, so a second settings row is refused by the
// database rather than prevented by everyone remembering not to create one.
// PocketBase has no transactions, so "make the bad state impossible" is the
// tool available (see the pocketbase-patterns skill); a second row would give
// the app two disagreeing authorities and no rule for picking between them.
//
// The row is seeded here with `api`, which is the summer-long default: the
// Euroleague API is confirmed working for E2026 and good enough to trust for
// months. The flip to `csv` happens near draft night, when the one source that
// cannot go down or change shape on the night is a file the commissioner holds.
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "app_settings",
      // Readable by any signed-in member: the players page says which source is
      // authoritative, because "why did my correction get overwritten" is
      // otherwise unanswerable from the UI.
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        // Always "app". See the singleton note above.
        { name: "singleton", type: "text", required: true, max: 8 },
        {
          name: "roster_authority",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["api", "csv"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_app_settings_singleton` ON `app_settings` (`singleton`)",
      ],
    });

    app.save(collection);

    // Seed the one row, so nothing downstream has to handle "no settings yet".
    const settings = new Record(collection);
    settings.set("singleton", "app");
    settings.set("roster_authority", "api");
    app.save(settings);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("app_settings"));
  },
);
