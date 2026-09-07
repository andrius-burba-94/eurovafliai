/// <reference path="../pb_data/types.d.ts" />

// Phase 3.5 — `chat_messages`: the league's conversation, and the transcript of
// draft night.
//
// ## Why this exists is not the chatter
//
// A rollback has been silent since 2.4. The commissioner walks the board back
// and anybody who was not staring at the room when it happened has no way to
// learn that it did — the picks simply are not there any more. 2.4's own
// blueprint text asks for a system chat message and there was no chat to put it
// in. This collection is that, and the sociable half comes along for free.
//
// ## Author is a membership, not a user
//
// A message shows a *team name*, which lives on `league_members` — so pointing
// at the membership makes the common read a single relation hop instead of a
// join through `users`. Same reasoning that keyed `cheat_sheets` on membership.
//
// It is **nullable, and null means the app is speaking**. `kind` says the same
// thing and is the field the UI branches on; the two are kept in step by the one
// function that writes system lines (`src/lib/chat/store.ts`), because a
// nullable relation is the kind of field that quietly becomes null for the wrong
// reason — a membership being deleted, for instance, which is exactly why
// `author` does **not** cascade-delete. A member who leaves the league leaves
// their messages behind as a record; wiping them would edit history, and a
// cascade would silently convert every one of them into a system message.
//
// ## Writes are superuser-only, and that is a withdrawal
//
// The blueprint's §4 said `chat_messages` create "can be client-direct … for
// latency". It is not, and the exception is withdrawn in this slice. Both paths
// end in the same record create firing the same realtime event, so every *other*
// device sees a message exactly as fast; client-direct would only have saved the
// sender's own hop to a PocketBase on 127.0.0.1, which optimistic rendering
// hides anyway. What it would have cost is a second write path, validation
// duplicated into a rule expression, and the rate limit living on the box
// instead of in git.
//
// So: read is scoped to league membership — reads use the viewer's own token and
// the realtime subscription needs it — and every write arrives through a server
// action.
migrate(
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");
    const members = app.findCollectionByNameOrId("league_members");

    // Anybody in this league, and nobody else. Not the commissioner of another
    // league, not a signed-in stranger. `pb:verify` drives it with two leagues.
    const inLeague =
      "@collection.league_members.league ?= league && " +
      "@collection.league_members.user ?= @request.auth.id";

    const collection = new Collection({
      type: "base",
      name: "chat_messages",
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
          // The league going takes its conversation with it — 3.6b already
          // deletes drafts, picks and memberships, and a transcript of a league
          // that no longer exists is nothing to keep.
          cascadeDelete: true,
        },
        {
          name: "author",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: members.id,
          // **Deliberately false.** See the note above: cascading would turn a
          // departed member's messages into system messages, which is worse
          // than either keeping or deleting them.
          cascadeDelete: false,
        },
        // Capped here as well as in the action. The action is the door; this is
        // the wall behind it, and it is the one that holds if a future caller
        // forgets.
        { name: "body", type: "text", required: false, max: 2000 },
        {
          name: "kind",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["user", "system"],
        },
        // The tombstone. A delete clears `body` and sets this, so the text is
        // genuinely gone from the database rather than hidden by the client,
        // and the row survives to say a message was retracted.
        { name: "deleted", type: "bool", required: false },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        // Every read is "this league, in order". No unique index here on
        // purpose: two members may say the same thing at the same moment, and
        // nothing about a conversation is supposed to be refused.
        "CREATE INDEX `idx_chat_messages_league_created` ON `chat_messages` (`league`, `created`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("chat_messages"));
  },
);
