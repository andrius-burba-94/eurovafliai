/// <reference path="../pb_data/types.d.ts" />

// Slice 7.0 — `ai_writeups`: model-written commentary, written once and read
// by everyone the same.
//
// A page never calls the model. The worker (from 7.1) and `npm run ai:preview`
// write a row per (league, season, round, kind, member); readers get the
// stored prose and render its tokens back to names at read time. `member` is
// empty for a league-wide write-up and set for one only its member may read
// (the scout, the lineup coach). Unique (league, season, round, kind, member)
// is the backstop under the claim: PocketBase stores an unset relation as ''
// so two league-wide rows for one round collide as intended.
//
// `input_hash` covers the facts, the voice, the prompt version and the model;
// a row is regenerated only when it changes. `facts` is the exact sheet the
// model read, kept so a sentence can always be traced to its source, and it
// is HIDDEN: superusers only, never sent to a page. `status` is the repair
// key: a crash between the claim and the finish leaves `pending`, which the
// next run takes over once it is stale. `kind` starts with the one kind 7.0
// writes; each later kind adds its value in the migration of its own slice.
//
// Rollback: drop the collection. Nothing else reads it in 7.0.

migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");
    const members = app.findCollectionByNameOrId("league_members");

    const inLeague =
      "@collection.league_members:mine.league ?= league && " +
      "@collection.league_members:mine.user ?= @request.auth.id && " +
      "(member = '' || member.user = @request.auth.id)";

    const collection = new Collection({
      type: "base",
      name: "ai_writeups",
      listRule: inLeague,
      viewRule: inLeague,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "league", type: "relation", required: true, maxSelect: 1, collectionId: leagues.id, cascadeDelete: true },
        { name: "season", type: "text", required: true, max: 12 },
        // Not required: 0 fails a required number, and a later kind may have no round.
        { name: "round", type: "number", onlyInt: true, min: 0 },
        { name: "kind", type: "select", required: true, maxSelect: 1, values: ["round_summary"] },
        { name: "member", type: "relation", required: false, maxSelect: 1, collectionId: members.id, cascadeDelete: true },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["pending", "ready", "failed"] },
        { name: "voice", type: "select", required: true, maxSelect: 1, values: ["analyst", "pundit"] },
        { name: "model", type: "text", max: 80 },
        { name: "prompt_version", type: "text", max: 40 },
        { name: "input_hash", type: "text", required: true, min: 64, max: 64 },
        { name: "facts", type: "json", hidden: true, maxSize: 262144 },
        // The prose in tokens, and what each token stands for.
        { name: "output", type: "json", maxSize: 20000 },
        { name: "refs", type: "json", maxSize: 20000 },
        { name: "error", type: "text", max: 500 },
        { name: "tokens_in", type: "number", onlyInt: true, min: 0 },
        { name: "tokens_out", type: "number", onlyInt: true, min: 0 },
        { name: "tokens_thinking", type: "number", onlyInt: true, min: 0 },
        { name: "attempts", type: "number", onlyInt: true, min: 0 },
        { name: "claimed_at", type: "date" },
        { name: "generated_at", type: "date" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_ai_writeups_key` ON `ai_writeups` (`league`, `season`, `round`, `kind`, `member`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("ai_writeups"));
  },
);
