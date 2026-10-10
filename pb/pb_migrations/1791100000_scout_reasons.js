/// <reference path="../pb_data/types.d.ts" />

// Slice 7.2 G — the reasons for a member's moves worth making.
//
// `ai_writeups.kind` gains `scout_moves`: one row per (league, season, round,
// member), written once per finished round. The existing read rule already
// confines a row with a `member` to that member's own user, so another
// member's advice cannot be read even by asking the API directly.
//
// `player_outlooks` gains what the reasons' fact sheet cites beside the
// outlook, so a sentence about a player rests on figures the advisor computed:
// his rate a minute (hundredths of points), his expected minutes in role
// (tenths), how many of his last games (up to 5) he started, and his club's
// average win chance over the next five (a percent). All derived; the next
// outlook pass fills them.
//
// Rollback: remove the fields and the kind. A `scout_moves` row would fail
// the narrowed select, so delete those rows first.

const FIELDS = ["rate_per_minute", "minutes", "starts_recent", "games_recent", "win_chance_5"];

migrate(
  (app) => {
    const writeups = app.findCollectionByNameOrId("ai_writeups");
    const kind = writeups.fields.getByName("kind");
    kind.values = ["round_summary", "scout_moves"];
    app.save(writeups);

    const outlooks = app.findCollectionByNameOrId("player_outlooks");
    for (const name of FIELDS) outlooks.fields.add(new Field({ name, type: "number", onlyInt: true, min: 0 }));
    app.save(outlooks);
  },
  (app) => {
    app.db().newQuery("DELETE FROM ai_writeups WHERE kind = 'scout_moves'").execute();
    const writeups = app.findCollectionByNameOrId("ai_writeups");
    writeups.fields.getByName("kind").values = ["round_summary"];
    app.save(writeups);

    const outlooks = app.findCollectionByNameOrId("player_outlooks");
    for (const name of FIELDS) outlooks.fields.removeById(outlooks.fields.getByName(name).id);
    app.save(outlooks);
  },
);
