/// <reference path="../pb_data/types.d.ts" />

// Phase 2.1 — the canonical `players` table.
//
// One table, two front doors. The Euroleague API sync and the commissioner's
// CSV both write here through the same normalize → diff → apply pipeline
// (blueprint D8). There is deliberately NOT one table per source: picks, cheat
// sheets, roster memberships and game stats all reference player ids, so two
// switchable sets would orphan every one of those references the moment anyone
// "switched".
//
// NAMING: `club_code` / `club_name`, not the blueprint §4 sketch's `team_code` /
// `team_name`. CONTEXT.md's "words we do not use" is explicit that **team** is
// ambiguous — a Euroleague side is a **club**, a member's fantasy squad is a
// roster — and CLAUDE.md says names in code follow that glossary. The blueprint
// defines the target; the glossary names it.
//
// THE TWO INDEXES, both correctness rather than performance (324 rows is a scan
// either way):
//
//  1. `person_code` unique **only where it is set**. 43 of 324 E2026 players
//     have no code yet (13%, docs/research/euroleague-api.md finding 2), and
//     PocketBase stores unset text as `''` rather than NULL — so a plain unique
//     index would let the first codeless player in and refuse the other 42. The
//     `WHERE person_code != ''` clause is what makes the constraint mean "no two
//     players share a code" instead of "at most one player lacks one".
//
//  2. unique `(name_normalized, club_code)` — the physical backstop under the
//     fallback match path. With 13% of players codeless, "match by normalized
//     name + club" is the common path, not an edge case, and this index is what
//     makes it safe: if two rows ever collide on that key the database refuses
//     the second rather than the pipeline quietly merging two people.
//
// Writes are superuser-only. The pool is reference data every signed-in member
// reads and nobody edits from a browser.
migrate(
  (app) => {
    const collection = new Collection({
      type: "base",
      name: "players",
      // The pool is not league-private: it is the same 324 players for
      // everyone, and Phase 3's search and filters read it with the user's own
      // token.
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        // Display name, title-cased: "Cordinier, Isaia".
        { name: "name", type: "text", required: true, max: 120 },
        // The diacritics-folded, order-insensitive match and search key —
        // Valančiūnas findable as "valanciunas" (CONTEXT.md). Order-insensitive
        // because the API says "SURNAME, FIRSTNAME" and a hand-made CSV will say
        // "Firstname Surname"; see src/lib/rosters/normalize.ts.
        { name: "name_normalized", type: "text", required: true, max: 120 },
        { name: "club_code", type: "text", required: true, min: 2, max: 4 },
        { name: "club_name", type: "text", required: true, max: 80 },
        {
          name: "position",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["G", "F", "C"],
        },
        // `left` is terminal and is a status, never a deletion: history
        // references these ids. A select rather than free text so an ingest
        // cannot invent a fourth state.
        {
          name: "status",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["active", "injured", "doubtful", "left"],
        },
        // The Euroleague external id, for exact stats joins in Phase 4.
        // NOT required: 13% of E2026 players do not have one yet, and a
        // re-sync fills them in as clubs register.
        { name: "person_code", type: "text", max: 24 },
        {
          name: "source",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["api", "csv", "manual"],
        },
        // A commissioner's correction, untouchable by either source. NOT
        // `required`: PocketBase's required check is a truthy test, so it would
        // reject `false` — the value that means "not locked". Same trap as
        // `draft_position` in 1788124600 and `is_ready` in 1788181200.
        { name: "manual_lock", type: "bool" },
        // Jersey number as text: it is an identifier, not a quantity, and "00"
        // is a real number that arithmetic would eat.
        { name: "dorsal", type: "text", max: 4 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_players_person_code` ON `players` (`person_code`) WHERE `person_code` != ''",
        "CREATE UNIQUE INDEX `idx_players_name_club` ON `players` (`name_normalized`, `club_code`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("players"));
  },
);
