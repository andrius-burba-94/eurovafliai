/// <reference path="../pb_data/types.d.ts" />

// Matchnight S2 (ADR-0011) — a member's team identity on `league_members`.
//
// `team_color` is one of twelve curated colours and `team_crest` one of four
// crest shapes. Both are optional selects: a member who never chose is drawn
// with a deterministic default from their place in the league
// (`src/lib/teams/identity.ts`), so no backfill is needed and a rollback
// loses nothing but the choices themselves.
//
// No rule changes. Writes to this collection are already superuser-only and go
// through the `setTeamIdentity` server action, which checks that the viewer is
// styling their own team or manages the league. The values mirror
// `TEAM_COLORS` and `CREST_SHAPES`; a stored value the app no longer knows
// falls back to the default rather than failing to render.
migrate(
  (app) => {
    const members = app.findCollectionByNameOrId("league_members");

    members.fields.add(
      new Field({
        name: "team_color",
        type: "select",
        maxSelect: 1,
        values: [
          "ember",
          "royal",
          "teal",
          "mustard",
          "violet",
          "crimson",
          "forest",
          "sky",
          "magenta",
          "lime",
          "slate",
          "sand",
        ],
      }),
    );
    members.fields.add(
      new Field({
        name: "team_crest",
        type: "select",
        maxSelect: 1,
        values: ["waffle", "shield", "roundel", "hex"],
      }),
    );

    app.save(members);
  },
  (app) => {
    const members = app.findCollectionByNameOrId("league_members");
    for (const name of ["team_color", "team_crest"]) {
      const field = members.fields.getByName(name);
      if (field) members.fields.removeById(field.id);
    }
    app.save(members);
  },
);
