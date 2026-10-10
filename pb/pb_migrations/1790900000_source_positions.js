/// <reference path="../pb_data/types.d.ts" />

// Slice 7.2 D — each game's positions for the whole pool, and position questions.
//
// `players` gains the Fantasy Challenge's position beside the BasketNews one,
// a `*_confirmed` flag per game (a commissioner's answer: no later read may
// touch that position) and a `*_listed` flag per game (the game lists him
// today, so he can be signed there; a linked league's free agents are listed
// players only). Bools are not `required`: false is a real value.
//
// `leagues.positions_read_at` is when the worker last read the league's game's
// pool. Empty means never, which is how a new league is read on the next pass.
//
// `position_questions` holds what a read cannot decide: a stored position the
// game now reports differently (`kind = player`), or a member's synced roster
// that does not count the league's template in that game's positions
// (`kind = roster`, the roster in `roster`). Reads are for the league's
// managers only (the commissioner, or a member with `can_manage`), because the
// questions live on the mapping queue, which only they see. Writes are
// superuser-only: the worker raises them, a server action answers them.
//
// unique(open_key) WHERE open_key != '' is the backstop for "one open question
// per player (or roster) per league" when two passes race. An answered or
// resolved question clears its key, so a later disagreement can be asked again.
// (league, status) serves the queue's count and list.
//
// Rollback: drop the collection and every field added here. The positions the
// reads wrote are lost with `fantasy_position`; `basketnews_position` is older
// and stays.

const SOURCES = ["basketnews", "fantasy"];
const POSITIONS = ["G", "F", "C"];

migrate(
  (app) => {
    const players = app.findCollectionByNameOrId("players");
    players.fields.add(new Field({ name: "fantasy_position", type: "select", maxSelect: 1, values: POSITIONS }));
    for (const name of ["basketnews_position_confirmed", "fantasy_position_confirmed", "basketnews_listed", "fantasy_listed"]) {
      players.fields.add(new Field({ name, type: "bool" }));
    }
    app.save(players);

    const leagues = app.findCollectionByNameOrId("leagues");
    leagues.fields.add(new Field({ name: "positions_read_at", type: "date" }));
    app.save(leagues);

    const members = app.findCollectionByNameOrId("league_members");
    const users = app.findCollectionByNameOrId("users");
    const manages =
      '@request.auth.id != "" && (league.commissioner = @request.auth.id || (' +
      "@collection.league_members:manager.league ?= league && " +
      "@collection.league_members:manager.user ?= @request.auth.id && " +
      "@collection.league_members:manager.can_manage ?= true))";

    const questions = new Collection({
      type: "base",
      name: "position_questions",
      listRule: manages,
      viewRule: manages,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: "league", type: "relation", required: true, maxSelect: 1, collectionId: leagues.id, cascadeDelete: true },
        { name: "source", type: "select", required: true, maxSelect: 1, values: SOURCES },
        { name: "kind", type: "select", required: true, maxSelect: 1, values: ["player", "roster"] },
        { name: "player", type: "relation", maxSelect: 1, collectionId: players.id, cascadeDelete: true },
        { name: "member", type: "relation", maxSelect: 1, collectionId: members.id, cascadeDelete: true },
        { name: "stored_position", type: "select", maxSelect: 1, values: POSITIONS },
        { name: "read_position", type: "select", maxSelect: 1, values: POSITIONS },
        { name: "roster", type: "json" },
        { name: "status", type: "select", required: true, maxSelect: 1, values: ["open", "answered", "resolved"] },
        { name: "answer", type: "select", maxSelect: 1, values: POSITIONS },
        { name: "answered_at", type: "date" },
        { name: "answered_by", type: "relation", maxSelect: 1, collectionId: users.id, cascadeDelete: false },
        { name: "open_key", type: "text" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_position_questions_open` ON `position_questions` (`open_key`) WHERE `open_key` != ''",
        "CREATE INDEX `idx_position_questions_league_status` ON `position_questions` (`league`, `status`)",
      ],
    });
    app.save(questions);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("position_questions"));

    const leagues = app.findCollectionByNameOrId("leagues");
    leagues.fields.removeById(leagues.fields.getByName("positions_read_at").id);
    app.save(leagues);

    const players = app.findCollectionByNameOrId("players");
    for (const name of ["fantasy_position", "basketnews_position_confirmed", "fantasy_position_confirmed", "basketnews_listed", "fantasy_listed"]) {
      players.fields.removeById(players.fields.getByName(name).id);
    }
    app.save(players);
  },
);
