/// <reference path="../pb_data/types.d.ts" />

// Durable source-player approvals and roster intents. Questions are private to
// server actions, which check the affected league's managers. Roster journals
// are member-readable and superuser-write-only, like fantasy_syncs. Unique
// source identities and transaction legs make retries safe without transactions.
// Rollback removes the journals/provenance, but keeps players and roster history.
migrate((app) => {
  const leagues = app.findCollectionByNameOrId("leagues");
  const players = app.findCollectionByNameOrId("players");
  const users = app.findCollectionByNameOrId("users");
  players.fields.add(new Field({ name: "awaiting_registration", type: "bool" }));
  app.save(players);
  leagues.fields.add(new Field({ name: "basketnews_roster_round", type: "number" }));
  app.save(leagues);
  const syncs = app.findCollectionByNameOrId("fantasy_syncs");
  syncs.fields.add(new Field({ name: "diagnostics", type: "json", maxSize: 200000 }));
  app.save(syncs);
  app.save(new Collection({
    name: "source_player_questions", type: "base",
    listRule: null, viewRule: null, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "provider", type: "select", required: true, maxSelect: 1, values: ["basketnews"] },
      { name: "season", type: "text", required: true },
      { name: "source_id", type: "text", required: true, max: 24 },
      { name: "details", type: "json", required: true },
      { name: "leagues", type: "json", required: true },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "approved", "confirmed"] },
      { name: "player", type: "relation", maxSelect: 1, collectionId: players.id, cascadeDelete: false },
      { name: "approved_by", type: "relation", maxSelect: 1, collectionId: users.id, cascadeDelete: false },
      { name: "checked_at", type: "date" },
      { name: "confirmed_at", type: "date" },
      { name: "recovery_pending", type: "bool" },
      { name: "pending_leagues", type: "json" },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
      { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_source_player_identity ON source_player_questions (provider, season, source_id)"],
  }));
  app.save(new Collection({
    name: "basketnews_roster_batches", type: "base",
    listRule: app.findCollectionByNameOrId("fantasy_syncs").listRule,
    viewRule: app.findCollectionByNameOrId("fantasy_syncs").viewRule,
    createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: "league", type: "relation", required: true, maxSelect: 1, collectionId: leagues.id, cascadeDelete: true },
      { name: "season", type: "text", required: true },
      { name: "round", type: "number", min: 1 },
      { name: "target_hash", type: "text", required: true },
      { name: "target", type: "json", required: true },
      { name: "steps", type: "json", maxSize: 500000 },
      { name: "at", type: "date", required: true },
      { name: "status", type: "select", required: true, maxSelect: 1, values: ["applying", "applied"] },
      { name: "created", type: "autodate", onCreate: true, onUpdate: false },
    ],
    indexes: ["CREATE UNIQUE INDEX idx_basketnews_roster_target ON basketnews_roster_batches (league, season, round, target_hash)"],
  }));
  const transactions = app.findCollectionByNameOrId("transactions");
  for (const name of ["source_provider", "source_event_id", "source_leg"]) {
    transactions.fields.add(new Field({ name, type: "text" }));
  }
  transactions.indexes.push("CREATE UNIQUE INDEX idx_transactions_source_leg ON transactions (league, source_provider, source_event_id, source_leg) WHERE source_event_id != ''");
  app.save(transactions);
}, (app) => {
  app.delete(app.findCollectionByNameOrId("source_player_questions"));
  app.delete(app.findCollectionByNameOrId("basketnews_roster_batches"));
  const syncs = app.findCollectionByNameOrId("fantasy_syncs");
  syncs.fields.removeById(syncs.fields.getByName("diagnostics").id);
  app.save(syncs);
  const players = app.findCollectionByNameOrId("players");
  players.fields.removeById(players.fields.getByName("awaiting_registration").id);
  app.save(players);
  const leagues = app.findCollectionByNameOrId("leagues");
  leagues.fields.removeById(leagues.fields.getByName("basketnews_roster_round").id);
  app.save(leagues);
  const transactions = app.findCollectionByNameOrId("transactions");
  transactions.indexes = transactions.indexes.filter((index) => !index.includes("idx_transactions_source_leg"));
  for (const name of ["source_provider", "source_event_id", "source_leg"]) transactions.fields.removeById(transactions.fields.getByName(name).id);
  app.save(transactions);
});
