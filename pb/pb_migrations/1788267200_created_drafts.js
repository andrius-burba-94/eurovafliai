/// <reference path="../pb_data/types.d.ts" />

// Phase 2.4 — the `drafts` record: the single source of truth for a live draft.
//
// ADR-0002's first principle is that the server is the only authority. This
// record is what that means concretely: whose turn it is (`current_pick`), how
// long they have (`deadline`), and whether the draft is running at all
// (`status`). Clients render it and request actions against it; they never
// decide any of it.
//
// `order` is the rolled member order, frozen at the moment the draft starts.
// It is stored rather than recomputed from `league_members.draft_position`
// because those rows keep changing — a member can be removed, a position
// re-rolled — and a draft that silently re-ordered itself halfway through would
// be unrecoverable. The engine's `buildPickOrder` expands this into the full
// pick sequence; storing the expansion instead would bake the format in.
//
// One live draft per league, enforced by a partial unique index: a league may
// accumulate `complete` drafts season after season, but only ever one that is
// not finished. That is the physical backstop under "you cannot start a draft
// twice", which validation alone could lose to a double-click.
//
// `current_pick` and `rounds` are deliberately NOT `required`: PocketBase's
// required check is a truthy test, so it would reject 0 — and while 0 is not a
// legal pick number, being unable to store it is a trap rather than a
// safeguard. The same reason `draft_position` and `is_ready` are optional.
migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");

    const collection = new Collection({
      type: "base",
      name: "drafts",
      // Readable by anyone who can read the league it belongs to. The draft
      // room subscribes to this record with the viewer's own token, so the rule
      // is what scopes the subscription.
      listRule:
        "@collection.league_members:mine.league ?= league && " +
        "@collection.league_members:mine.user ?= @request.auth.id",
      viewRule:
        "@collection.league_members:mine.league ?= league && " +
        "@collection.league_members:mine.user ?= @request.auth.id",
      // Superuser-only. Every state change is a server action.
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
          name: "format",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["linear", "snake", "snake3rr"],
        },
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["setup", "live", "paused", "complete"],
        },
        // The rolled member order, frozen when the draft starts.
        { name: "order", type: "json", required: true },
        // Rounds = roster size. Frozen too, for the same reason as the order.
        { name: "rounds", type: "number", required: false, onlyInt: true, min: 1 },
        // 1-based overall_no of the pick being waited on.
        { name: "current_pick", type: "number", required: false, onlyInt: true, min: 1 },
        // Absolute, server-set. Clients render a countdown against it using an
        // offset from /api/time; the worker enforces it. Never a client clock.
        { name: "deadline", type: "date" },
        { name: "pick_seconds", type: "number", required: false, onlyInt: true, min: 5 },
        // The seed the order was rolled from, carried over from the league so a
        // finished draft can still explain itself.
        { name: "seed", type: "text", max: 64 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        // One unfinished draft per league. Partial, so finished drafts can pile
        // up across seasons without tripping it.
        "CREATE UNIQUE INDEX `idx_drafts_live_per_league` ON `drafts` (`league`) WHERE `status` != 'complete'",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("drafts"));
  },
);
