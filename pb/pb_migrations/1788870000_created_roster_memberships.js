/// <reference path="../pb_data/types.d.ts" />

// Phase 5.1 — `roster_memberships`: a player's stay on a member's roster.
//
// Until now standings joined the newest complete draft's picks. A pick is a
// draft-night event; a membership is a date window, and 5.2 will close one
// (`to_date`) when a trade moves a player. This collection is that window.
//
// Reads are in-league (same `league_members:mine` idiom as snapshots). Writes
// are superuser-only: materialize on draft complete, later the trade builder.
//
// unique(league, player) WHERE `to_date` = '' is the physical backstop that a
// player cannot sit on two active rosters. Historical rows (a closed
// `to_date`) must not collide, which is why the index is partial — the same
// shape as `idx_drafts_live_per_league`. Active rows store `to_date` as the
// empty string, matching how `drafts.deadline` is cleared; an unset/null date
// would sit outside this WHERE and the unique would not see it.
//
// `(league, member)` is a read index for the team page, not a uniqueness
// claim — a member has many players.
//
// Rollback: drop the collection. Nothing else points at these rows yet.

migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");
    const members = app.findCollectionByNameOrId("league_members");
    const players = app.findCollectionByNameOrId("players");

    const inLeague =
      "@collection.league_members:mine.league ?= league && " +
      "@collection.league_members:mine.user ?= @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "roster_memberships",
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
        {
          name: "member",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: members.id,
          cascadeDelete: false,
        },
        {
          name: "player",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: players.id,
          cascadeDelete: false,
        },
        { name: "from_date", type: "date", required: true },
        { name: "to_date", type: "date" },
        {
          name: "acquired_via",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["draft", "trade", "signing"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_roster_memberships_active_player` ON `roster_memberships` (`league`, `player`) WHERE `to_date` = ''",
        "CREATE INDEX `idx_roster_memberships_league_member` ON `roster_memberships` (`league`, `member`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("roster_memberships"));
  },
);
