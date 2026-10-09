/// <reference path="../pb_data/types.d.ts" />

// Slice 7.1 — the worker's two bookmarks on `ai_writeups` (ADR-0013).
//
// `rewrite_requested_at`: the commissioner pressed Rewrite. The action only
// sets it; the worker's one-minute check finds the row, and the claim that
// starts the rewrite clears it. Indexed, because that check runs every minute
// and almost always finds nothing.
//
// `last_guarded_at`: when the stored prose last passed a re-guard against a
// freshly built sheet. The daily re-check and the one after a stat correction
// both compare against it; empty means "never checked", and the write's own
// `generated_at` stands in.
//
// Rollback: drop the index and both fields. Nothing else reads them.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("ai_writeups");
    collection.fields.add(new Field({ name: "rewrite_requested_at", type: "date" }));
    collection.fields.add(new Field({ name: "last_guarded_at", type: "date" }));
    collection.addIndex("idx_ai_writeups_rewrite", false, "`rewrite_requested_at`", "");
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("ai_writeups");
    collection.removeIndex("idx_ai_writeups_rewrite");
    collection.fields.removeById(collection.fields.getByName("rewrite_requested_at").id);
    collection.fields.removeById(collection.fields.getByName("last_guarded_at").id);
    app.save(collection);
  },
);
