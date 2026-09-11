/// <reference path="../pb_data/types.d.ts" />

// Slice 8.2 — draft-breaking stuck reason for the commissioner banner.
//
// The sweep already refuses two things it cannot fix (no legal player, a hole
// in the board) and logs them once. Nothing on the draft record said so, so a
// commissioner had to read worker logs to learn the draft was stuck. These two
// optional fields are what the room reads: a short reason code and when it was
// first set. Cleared when the sweep can move the draft again. Never required —
// a legitimate empty string on a healthy draft would fail PocketBase's truthy
// required check, and most drafts are never stuck.

migrate(
  (app) => {
    const collection = app.findCollectionByNameOrId("drafts");
    collection.fields.add(
      new Field({
        name: "stuck_reason",
        type: "text",
        max: 64,
      }),
    );
    collection.fields.add(
      new Field({
        name: "stuck_since",
        type: "date",
      }),
    );
    app.save(collection);
  },
  (app) => {
    const collection = app.findCollectionByNameOrId("drafts");
    for (const name of ["stuck_reason", "stuck_since"]) {
      const field = collection.fields.getByName(name);
      if (field) collection.fields.removeById(field.id);
    }
    app.save(collection);
  },
);
