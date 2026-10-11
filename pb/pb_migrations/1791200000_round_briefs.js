/// <reference path="../pb_data/types.d.ts" />

// Slice 7.3 B — every member's brief for a finished round.
//
// `ai_writeups.kind` gains `round_brief`: one row per (league, season, round,
// member), `output` holding three named lines. The existing read rule already
// confines a row with a `member` to that member's own user, the commissioner
// included, and the existing unique index keeps it one brief per member per
// round, so neither changes.
//
// Rollback: a `round_brief` row would fail the narrowed select, so those rows
// go first.

migrate(
  (app) => {
    const writeups = app.findCollectionByNameOrId("ai_writeups");
    writeups.fields.getByName("kind").values = ["round_summary", "scout_moves", "round_brief"];
    app.save(writeups);
  },
  (app) => {
    app.db().newQuery("DELETE FROM ai_writeups WHERE kind = 'round_brief'").execute();
    const writeups = app.findCollectionByNameOrId("ai_writeups");
    writeups.fields.getByName("kind").values = ["round_summary", "scout_moves"];
    app.save(writeups);
  },
);
