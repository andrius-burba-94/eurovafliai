/// <reference path="../pb_data/types.d.ts" />

// BasketNews mirrors are separate leagues. Source IDs are unique where set;
// one queued/running import per league is the worker's crash-recovery key.
migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");
    leagues.fields.add(new Field({ name: "basketnews_league_id", type: "text", max: 24 }));
    leagues.fields.add(new Field({ name: "basketnews_team_id", type: "text", max: 24 }));
    leagues.indexes.push("CREATE UNIQUE INDEX `idx_leagues_basketnews_id` ON `leagues` (`basketnews_league_id`) WHERE `basketnews_league_id` != ''");
    leagues.indexes.push("CREATE UNIQUE INDEX `idx_leagues_basketnews_team` ON `leagues` (`basketnews_team_id`) WHERE `basketnews_team_id` != ''");
    app.save(leagues);

    const members = app.findCollectionByNameOrId("league_members");
    members.fields.add(new Field({ name: "basketnews_team_id", type: "text", max: 24 }));
    members.indexes.push("CREATE UNIQUE INDEX `idx_members_basketnews_team` ON `league_members` (`basketnews_team_id`) WHERE `basketnews_team_id` != ''");
    app.save(members);

    const players = app.findCollectionByNameOrId("players");
    players.fields.add(new Field({ name: "basketnews_id", type: "text", max: 24 }));
    players.indexes.push("CREATE UNIQUE INDEX `idx_players_basketnews_id` ON `players` (`basketnews_id`) WHERE `basketnews_id` != ''");
    app.save(players);

    const lineups = app.findCollectionByNameOrId("round_lineups");
    lineups.fields.add(new Field({ name: "basketnews_result", type: "json", maxSize: 12000 }));
    lineups.indexes.push("CREATE INDEX `idx_round_lineups_league_season_round` ON `round_lineups` (`league`, `season`, `round`)");
    app.save(lineups);

    const stats = app.findCollectionByNameOrId("player_game_stats");
    stats.fields.add(new Field({ name: "basketnews_raw_pts", type: "number" }));
    app.save(stats);

    const syncs = app.findCollectionByNameOrId("fantasy_syncs");
    syncs.fields.add(new Field({ name: "provider", type: "select", maxSelect: 1, values: ["fantasy_challenge", "basketnews"] }));
    syncs.fields.add(new Field({ name: "job_meta", type: "json", maxSize: 20000 }));
    syncs.fields.add(new Field({ name: "active_league", type: "text", max: 15 }));
    syncs.fields.getByName("status").values = ["preview", "blocked", "applying", "applied", "failed", "queued", "running"];
    syncs.fields.getByName("kind").values = ["rosters", "lineups", "basketnews"];
    syncs.indexes.push("CREATE UNIQUE INDEX `idx_basketnews_active_job` ON `fantasy_syncs` (`active_league`) WHERE `active_league` != ''");
    syncs.indexes.push("CREATE INDEX `idx_fantasy_syncs_queue` ON `fantasy_syncs` (`provider`, `status`, `ran_at`)");
    syncs.indexes.push("CREATE INDEX `idx_fantasy_syncs_league_provider_status` ON `fantasy_syncs` (`league`, `provider`, `status`, `ran_at`)");
    app.save(syncs);
  },
  (app) => {
    const syncs = app.findCollectionByNameOrId("fantasy_syncs");
    syncs.indexes = syncs.indexes.filter((index) => !index.includes("idx_basketnews_active_job") && !index.includes("idx_fantasy_syncs_queue") && !index.includes("idx_fantasy_syncs_league_provider_status"));
    syncs.fields.getByName("status").values = ["preview", "blocked", "applying", "applied", "failed"];
    syncs.fields.getByName("kind").values = ["rosters", "lineups"];
    for (const name of ["provider", "job_meta", "active_league"]) syncs.fields.removeById(syncs.fields.getByName(name).id);
    app.save(syncs);
    for (const [collectionName, fields, indexes] of [
      ["leagues", ["basketnews_league_id", "basketnews_team_id"], ["idx_leagues_basketnews_id", "idx_leagues_basketnews_team"]],
      ["league_members", ["basketnews_team_id"], ["idx_members_basketnews_team"]],
      ["players", ["basketnews_id"], ["idx_players_basketnews_id"]],
      ["round_lineups", ["basketnews_result"], ["idx_round_lineups_league_season_round"]],
      ["player_game_stats", ["basketnews_raw_pts"], []],
    ]) {
      const collection = app.findCollectionByNameOrId(collectionName);
      collection.indexes = collection.indexes.filter((index) => !indexes.some((name) => index.includes(name)));
      for (const name of fields) collection.fields.removeById(collection.fields.getByName(name).id);
      app.save(collection);
    }
  },
);
