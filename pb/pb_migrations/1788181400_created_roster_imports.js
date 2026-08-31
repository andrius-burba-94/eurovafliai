/// <reference path="../pb_data/types.d.ts" />

// Phase 2.1 — `roster_imports`, one record per ingestion run.
//
// Every batch is stored whether or not it was applied (blueprint D8: "every
// import from either source is stored as a `roster_imports` batch — separate,
// auditable, re-applicable"). That is what makes the report-only mode of the
// non-authoritative source useful: an API sync while the CSV holds authority
// writes nothing to `players` and still leaves a full record of what it would
// have changed, which is the drift report the blueprint asks for.
//
// `diff` holds the computed plan — adds, changes with their before values,
// leaving, blocked and problems — exactly as `src/lib/rosters/diff.ts` produced
// it. Storing the plan rather than a summary is deliberate: it is the audit
// trail, and re-applying a historical batch has to mean the same thing later.
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "roster_imports",
      // Readable by any signed-in member: it is club and player names, nothing
      // private, and a history view should read with the user's own token.
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "source",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["api", "csv"],
        },
        // The Euroleague season code, e.g. "E2026". Read from the feed rather
        // than assumed: the 2026-27 club list is not last season's, so a batch
        // has to say which season it describes.
        { name: "season", type: "text", required: true, max: 12 },
        // Did this batch write to `players`? False for a report-only run by the
        // non-authoritative source, and false for a preview nobody confirmed.
        { name: "applied", type: "bool" },
        // How many normalized rows the source produced. NOT required: an import
        // that legitimately read zero rows would be rejected by PocketBase's
        // truthy required check.
        { name: "rows", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "diff", type: "json" },
        { name: "log", type: "text", max: 20000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        // "the last few imports, newest first" is the only query this has.
        "CREATE INDEX `idx_roster_imports_created` ON `roster_imports` (`created`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("roster_imports"));
  },
);
