/// <reference path="../pb_data/types.d.ts" />

// Slice 9.1 — average PIR, last season's body of work, and the bio the feed
// was already sending.
//
// Three groups, all derived caches like 4.4's four, and none of them a source
// of truth. Box scores stay in `player_game_stats`; the roster feed stays the
// authority for who is on a club.
//
// 1. `proj_*_pir` — PIR averages beside the fantasy ones 4.4 wrote. Integer
//    tenths, even though a stored `pir` is whole: an average of whole numbers
//    is not one. The pool displays and ranks on these.
// 2. `prev_season_*` — last season's per-game averages, imported from the
//    official stats table (`npm run stats:prev`). This is what a draft is
//    actually decided on, because a draft happens before the season starts.
//    `prev_season_code` travels with them so a number can say which season it
//    is from; a bare 22.1 that might be E2025 or E2024 is not evidence.
// 3. Bio — `height`, `weight`, `birth_date`, `country_*`. The roster feed has
//    sent these all along and nothing read them.
//
// None are `required`: a genuine average of 0 is a real number and PocketBase's
// required check is a truthy test that would refuse it. Absence is the games
// count, not the average — the same rule 4.4's migration states.
//
// No unique indexes: quantities, and a unique index on a number alone is the
// 0-collision trap the pocketbase-patterns skill already names.

migrate(
  (app) => {
    const players = app.findCollectionByNameOrId("players");

    for (const name of [
      "proj_last5_pir",
      "proj_season_pir",
      "prev_season_games",
      "prev_season_pir",
      "prev_season_fantasy",
      "height",
      "weight",
    ]) {
      players.fields.add(
        new Field({
          name,
          type: "number",
          onlyInt: true,
        }),
      );
    }

    players.fields.add(
      new Field({ name: "prev_season_code", type: "text", max: 12 }),
    );
    // One json column rather than ten numeric ones: these are read by the
    // player page and by nothing else, so they never need to be filtered or
    // sorted on, and the feed's shooting percentages arrive as strings
    // ("34.4%") that we display rather than compute with.
    players.fields.add(
      new Field({ name: "prev_season_stats", type: "json", maxSize: 2000 }),
    );
    // Text, not a date: the feed sends `1995-06-30T00:00:00` and we show a
    // year. Storing it as a date would invite timezone arithmetic on a value
    // that has no time in it.
    players.fields.add(
      new Field({ name: "birth_date", type: "text", max: 32 }),
    );
    players.fields.add(
      new Field({ name: "country_code", type: "text", max: 8 }),
    );
    players.fields.add(
      new Field({ name: "country_name", type: "text", max: 80 }),
    );

    app.save(players);
  },
  (app) => {
    const players = app.findCollectionByNameOrId("players");
    for (const name of [
      "proj_last5_pir",
      "proj_season_pir",
      "prev_season_games",
      "prev_season_pir",
      "prev_season_fantasy",
      "prev_season_code",
      "prev_season_stats",
      "height",
      "weight",
      "birth_date",
      "country_code",
      "country_name",
    ]) {
      const field = players.fields.getByName(name);
      if (field) players.fields.removeById(field.id);
    }
    app.save(players);
  },
);
