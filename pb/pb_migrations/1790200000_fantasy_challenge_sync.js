/// <reference path="../pb_data/types.d.ts" />

// Fantasy Challenge sync — rosters read from the official game after a round locks.
//
// Three link fields and one report collection:
//
// - `leagues.fantasy_league_id`: which official-game league this league mirrors.
//   Empty means the league is not synced; the worker skips it.
// - `league_members.fantasy_team_id`: the member's team in that league.
// - `players.fantasy_id`: the official game's player id. Partial unique while
//   set, the same idiom as `person_code`: two pool rows claiming one official
//   player would put one person's roster spot on two humans.
// - `fantasy_syncs`: one row per sync run — preview, blocked, applying, applied
//   or failed. It is the audit log and the repair key: an apply stores its
//   planned steps with `status = applying` before the first membership write,
//   so a run that dies halfway is finished by the next one from the same plan.
//   Read by the league's commissioner or its members (the `league_members:mine`
//   idiom from `transactions`, plus the commissioner, who need not be a member);
//   superuser-only writes.
//
// Rollback: drop `fantasy_syncs` and the three fields. Nothing else reads them.
migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");
    leagues.fields.add(new Field({ name: "fantasy_league_id", type: "text", max: 24 }));
    app.save(leagues);

    const members = app.findCollectionByNameOrId("league_members");
    members.fields.add(new Field({ name: "fantasy_team_id", type: "text", max: 24 }));
    app.save(members);

    const players = app.findCollectionByNameOrId("players");
    players.fields.add(new Field({ name: "fantasy_id", type: "text", max: 24 }));
    players.indexes.push(
      "CREATE UNIQUE INDEX `idx_players_fantasy_id` ON `players` (`fantasy_id`) WHERE `fantasy_id` != ''",
    );
    app.save(players);

    const inLeague =
      "league.commissioner = @request.auth.id || (" +
      "@collection.league_members:mine.league ?= league && " +
      "@collection.league_members:mine.user ?= @request.auth.id)";

    const syncs = new Collection({
      type: "base",
      name: "fantasy_syncs",
      listRule: inLeague,
      viewRule: inLeague,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "league",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: leagues.id,
          cascadeDelete: true,
        },
        { name: "mode", type: "select", required: true, maxSelect: 1, values: ["preview", "apply"] },
        { name: "round", type: "number", onlyInt: true, min: 0 },
        // The pass's own clock, which the hourly throttle reads.
        { name: "ran_at", type: "date", required: true },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["preview", "blocked", "applying", "applied", "failed"],
        },
        { name: "message", type: "text", max: 500 },
        { name: "moves", type: "json", maxSize: 50000 },
        { name: "questions", type: "json", maxSize: 200000 },
        { name: "steps", type: "json", maxSize: 200000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX `idx_fantasy_syncs_league_ran` ON `fantasy_syncs` (`league`, `ran_at`)",
      ],
    });
    app.save(syncs);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("fantasy_syncs"));

    const players = app.findCollectionByNameOrId("players");
    players.indexes = players.indexes.filter((index) => !index.includes("idx_players_fantasy_id"));
    const fantasyId = players.fields.getByName("fantasy_id");
    if (fantasyId) players.fields.removeById(fantasyId.id);
    app.save(players);

    for (const [name, field] of [
      ["league_members", "fantasy_team_id"],
      ["leagues", "fantasy_league_id"],
    ]) {
      const collection = app.findCollectionByNameOrId(name);
      const found = collection.fields.getByName(field);
      if (found) collection.fields.removeById(found.id);
      app.save(collection);
    }
  },
);
