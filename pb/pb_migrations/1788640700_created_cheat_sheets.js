/// <reference path="../pb_data/types.d.ts" />

// Phase 3.4 — `cheat_sheets`: a member's private ranked list, and what
// autodraft picks from.
//
// ## Keyed on the membership, not on the draft
//
// The blueprint's data model (§4) says `unique(member, draft)`. This ships
// `unique(member)` instead, and the reason is in 3.4's own wording — a sheet is
// "editable before *and during* the draft". Before the draft there **is** no
// `drafts` record: `startDraft` creates it, so a sheet keyed on one could not
// exist until the moment it stopped being useful to write.
//
// Worse, `drafts` is disposable. 3.6a's "start over" deletes the draft and its
// picks so a league can rehearse; a sheet cascading off `draft` would take
// every member's preparation with it, which is precisely the work 3.6a was
// careful to keep (it holds the draft order). And there is only ever one
// unfinished draft per league — the partial unique index on `drafts(league)`
// says so — so "one sheet per member" and "one sheet per member per draft" name
// the same row for as long as a league drafts once a season.
//
// The cost, stated: a league that drafts a second season on the same
// memberships inherits last season's sheet rather than starting blank. That is
// a stale sheet a member can see and edit, not a lost one, and Phase 6's keeper
// work is where a per-season sheet would be earned.
//
// ## Private, and that is a rule rather than a courtesy
//
// PRODUCT.md: members "build a private cheat sheet". Nobody else in the league
// may read it — not the commissioner, not a deputy. So the read rules traverse
// the relation to the owning user rather than scoping to the league the way
// every other collection here does, and writes are superuser-only like all
// engine-owned state: they arrive through server actions.
migrate(
  (app) => {
    const members = app.findCollectionByNameOrId("league_members");

    // Yours alone. `member.user` walks the relation to the account that owns
    // the membership; no league term appears, because a league gives nobody a
    // claim on this record.
    const mine = "member.user = @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "cheat_sheets",
      listRule: mine,
      viewRule: mine,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "member",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: members.id,
          // The membership going means the person left the league. Their
          // private ranking has nothing left to rank for, and unlike `picks`
          // no board points at it, so there is nothing to tear.
          cascadeDelete: true,
        },
        // Ordered player ids, best first — exactly what `rankForMember` walks.
        // Stored as JSON rather than as a join table: it is read whole, written
        // whole, and re-ordered whole by a drag, and a 60-row relation list
        // would turn one write into sixty with no transaction to hold them.
        { name: "ranking", type: "json", required: false, maxSize: 20000 },
        // Break positions, as counts of players before each break: `[3, 7]` is
        // 1–3, 4–7, 8–. Breaks rather than per-player labels, because a break
        // between two positions stays put when the players either side of it
        // are dragged, and a label travels with the player and re-groups the
        // sheet behind your back.
        { name: "tiers", type: "json", required: false, maxSize: 4000 },
        {
          name: "source",
          type: "select",
          required: false,
          maxSelect: 1,
          values: ["csv", "manual"],
        },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        // One sheet per member. Not composite and not on a number, so it is a
        // safe single-column unique index — a relation is never the unset `0`
        // that makes `unique(overall_no)` a trap.
        "CREATE UNIQUE INDEX `idx_cheat_sheets_member` ON `cheat_sheets` (`member`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("cheat_sheets"));
  },
);
