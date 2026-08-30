/// <reference path="../pb_data/types.d.ts" />

// Phase 1.1 — the cross-collection read rules for leagues and their members.
//
// Split from the two create migrations for a structural reason, not taste: a
// PocketBase API rule is validated when the collection is saved, so a rule may
// only reference collections that already exist. `leagues` is created first and
// cannot mention `league_members`; `league_members` cannot mention itself in the
// save that creates it. Both rules land here, once both collections exist.
//
// The `:member` / `:mine` aliases matter. PocketBase treats each distinct alias
// as its own join, so repeating one alias forces both conditions onto the SAME
// league_members row. Written without the alias, the two `?=` clauses could be
// satisfied by two different rows — "I am a member of some league" AND "some
// member belongs to this league" — which leaks every league to anyone who has
// joined any league.
//
// Writes stay superuser-only on both collections. These are read rules; server
// actions own every mutation.
migrate(
  (app) => {
    // A league is readable by its commissioner, or by a user who has a
    // membership row in that league.
    const leagueReadable =
      "commissioner = @request.auth.id || " +
      "(@collection.league_members:member.league ?= id && " +
      "@collection.league_members:member.user ?= @request.auth.id)";

    // A membership row is readable by anyone who is a member of the same league
    // — that is the lobby list, and later the draft board.
    const memberReadable =
      "@collection.league_members:mine.league ?= league && " +
      "@collection.league_members:mine.user ?= @request.auth.id";

    const leagues = app.findCollectionByNameOrId("leagues");
    unmarshal({ listRule: leagueReadable, viewRule: leagueReadable }, leagues);
    app.save(leagues);

    const members = app.findCollectionByNameOrId("league_members");
    unmarshal({ listRule: memberReadable, viewRule: memberReadable }, members);
    app.save(members);
  },
  (app) => {
    const leagues = app.findCollectionByNameOrId("leagues");
    unmarshal(
      {
        listRule: "commissioner = @request.auth.id",
        viewRule: "commissioner = @request.auth.id",
      },
      leagues,
    );
    app.save(leagues);

    const members = app.findCollectionByNameOrId("league_members");
    unmarshal(
      {
        listRule: "user = @request.auth.id",
        viewRule: "user = @request.auth.id",
      },
      members,
    );
    app.save(members);
  },
);
