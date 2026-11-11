/// <reference path="../pb_data/types.d.ts" />

// Frozen roles are gone (ADR-0015, superseding ADR-0014): a round scores the
// lineup the official game serves, which reproduced every official total of
// 2026–27 rounds 1–10, while the frozen roles overcounted every team from
// round 7. Nothing reads or writes `round_lineups.roles` any more.
//
// The stored roles were wrong, so dropping them loses nothing. Rollback adds
// the empty field back, as 1791300000 created it; the roles are not restored.

migrate(
  (app) => {
    const lineups = app.findCollectionByNameOrId("round_lineups");
    const roles = lineups.fields.getByName("roles");
    if (!roles) return;
    lineups.fields.removeById(roles.id);
    app.save(lineups);
  },
  (app) => {
    const lineups = app.findCollectionByNameOrId("round_lineups");
    if (lineups.fields.getByName("roles")) return;
    lineups.fields.add(new Field({ name: "roles", type: "json", maxSize: 8000 }));
    app.save(lineups);
  },
);
