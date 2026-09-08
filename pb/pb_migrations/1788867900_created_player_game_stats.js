/// <reference path="../pb_data/types.d.ts" />

// Phase 4.1 — `player_game_stats` and `stat_imports`: what really happened on
// the court, and the audit trail of how we learned it.
//
// ## The components are stored, not just the score
//
// `pir` and `fantasy_pts` are both derived, and they are still persisted —
// because standings (4.5) and projections (4.4) read them on every recompute
// and re-deriving nineteen fields per row per read is work with no upside. But
// **every component is stored too**, and that is the load-bearing decision.
// Scoring weights and the win bonus live in league settings, and the blueprint
// flags one thing we genuinely do not know yet: what the official ×1.1 does to
// a negative PIR on a win (open question 3, decided in 4.1 as "apply it
// uniformly"). If Round 1 proves that wrong, the fix has to be a settings
// change plus a recompute — and a recompute is only possible from components.
// Storing the score alone would have made a wrong guess permanent.
//
// ## `fantasy_pts` is integer tenths, and PocketBase cannot help us here
//
// PIR × 1.1 has one decimal place, and in binary floating point `3 * 1.1` is
// `3.3000000000000003`. A season of those summed into a standings table is a
// wrong number on a page that nobody can explain. So the column is an integer
// count of **tenths** — 33 means 3.3 — and `formatTenths` is the only place it
// becomes a decimal, in a string, at the last moment. `onlyInt: true` is the
// wall behind that; `src/lib/stats/scoring.ts` is the door.
//
// ## The key is player + season + game
//
// `game_code` is unique within a season (E2025 ran 1–406 with gaps) and a
// player appears at most once per game, so `unique(player, season, game_code)`
// is the physical backstop that makes an import idempotent. It matters more
// here than anywhere else in the app: PocketBase has no transactions, an import
// is hundreds of writes, and the recovery story for a run that dies halfway is
// simply **run it again** — the index refuses the rows that already landed and
// the upsert updates the ones whose numbers changed. There is no half-imported
// state to repair, because a row is complete or absent.
//
// ## `round` goes past 38, and `phase` is why
//
// CLAUDE.md says 38 regular-season rounds, and that is true of the regular
// season. The feed numbers straight through it: E2025 had rounds 1–38 as `RS`,
// then play-in 39–40, playoffs 41–45 and Final Four 46–47, 402 games in all.
// Everything is stored and `phase` says which is which, so whether the fantasy
// season counts the playoffs is a `filter` in 4.5 rather than data we threw
// away and would have to re-import to get back.
//
// ## Reads use the viewer's token; writes are superuser-only
//
// Same shape as every other collection here. Stats are public within the app —
// any signed-in member can read any player's game log, which is the whole point
// of a player profile page — and every write arrives through a server action or
// the worker, so the scoring rules live in git rather than in a rule
// expression.
migrate(
  (app) => {
    const players = app.findCollectionByNameOrId("players");

    const signedIn = '@request.auth.id != ""';

    const stats = new Collection({
      type: "base",
      name: "player_game_stats",
      listRule: signedIn,
      viewRule: signedIn,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "player",
          type: "relation",
          required: true,
          maxSelect: 1,
          collectionId: players.id,
          // A player is never deleted — 2.1 made departure a *status* — so this
          // cascade is a backstop rather than a path anybody takes. If one ever
          // is deleted, box scores attached to nobody are not worth keeping.
          cascadeDelete: true,
        },
        // "E2026". Stored per row rather than inferred from the date, because
        // the season is what makes `game_code` unique.
        { name: "season", type: "text", required: true, max: 12 },
        {
          name: "game_code",
          type: "number",
          required: true,
          onlyInt: true,
          min: 1,
        },
        // 1–47 in a season with a Final Four. Not capped at 38: see above.
        {
          name: "round",
          type: "number",
          required: true,
          onlyInt: true,
          min: 1,
        },
        {
          name: "phase",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["RS", "PI", "PO", "FF"],
        },
        // The club this player turned out for that night, which is not always
        // the club they are on now — a mid-season transfer means a game log
        // spanning two, and a standings recompute must not rewrite history.
        { name: "club_code", type: "text", required: true, max: 8 },
        // Both scores, so the win is derivable from the row itself and forever.
        // Deliberately **not** a `won` boolean: the feed's own `winner` field
        // is the season's champion on every game of the season (see
        // docs/research/euroleague-api.md), and a stored flag is one more place
        // for a stated winner to disagree with the scoreline.
        {
          name: "team_score",
          type: "number",
          required: false,
          onlyInt: true,
          min: 0,
        },
        {
          name: "opponent_score",
          type: "number",
          required: false,
          onlyInt: true,
          min: 0,
        },

        // --- The line itself. Every one of these is `required: false`, because
        // PocketBase's `required` is a *truthy* check and a genuine nought —
        // which is most cells in most box scores — would be refused by it.
        { name: "time_played", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "points", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "fgm2", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "fga2", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "fgm3", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "fga3", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "ftm", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "fta", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "reb_off", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "reb_def", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "reb_total", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "assists", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "steals", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "turnovers", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "blocks_for", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "blocks_against", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "fouls_committed", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "fouls_drawn", type: "number", required: false, onlyInt: true, min: 0 },
        // The one that can legitimately be negative, so it carries no `min`.
        { name: "plus_minus", type: "number", required: false, onlyInt: true },

        // --- Derived, and stored because everything downstream reads them.
        // `pir` can be negative and so can `fantasy_pts`; neither takes a
        // `min`, and a floor here would silently turn a bad night into an
        // average one.
        { name: "pir", type: "number", required: false, onlyInt: true },
        {
          name: "fantasy_pts",
          type: "number",
          required: false,
          onlyInt: true,
        },
        // Which batch last wrote this row. A plain text id rather than a
        // relation: a batch may be pruned one day and a box score must not go
        // with it, nor become a dangling relation that a cascade would delete.
        { name: "import_batch", type: "text", required: false, max: 40 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        // The physical backstop. Without transactions this is what makes a
        // re-run of a half-finished import safe.
        "CREATE UNIQUE INDEX `idx_player_game_stats_unique` ON `player_game_stats` (`player`, `season`, `game_code`)",
        // "this player's game log, in order" — the profile page (4.5).
        "CREATE INDEX `idx_player_game_stats_player` ON `player_game_stats` (`player`, `season`, `round`)",
        // "everything in this round" — a standings recompute after an ingest.
        "CREATE INDEX `idx_player_game_stats_round` ON `player_game_stats` (`season`, `phase`, `round`)",
      ],
    });

    app.save(stats);

    // One record per ingestion run, applied or not — the same shape and the
    // same argument as `roster_imports` (blueprint D8). A preview that nobody
    // confirmed is still stored, so "what would this sheet have done" is
    // answerable after the fact.
    const imports = new Collection({
      type: "base",
      name: "stat_imports",
      listRule: signedIn,
      viewRule: signedIn,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "source",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["api", "csv"],
        },
        { name: "season", type: "text", required: true, max: 12 },
        { name: "applied", type: "bool" },
        {
          name: "rows",
          type: "number",
          required: false,
          onlyInt: true,
          min: 0,
        },
        { name: "created_rows", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "updated_rows", type: "number", required: false, onlyInt: true, min: 0 },
        { name: "unchanged_rows", type: "number", required: false, onlyInt: true, min: 0 },
        // The plan, exactly as `src/lib/stats/plan.ts` computed it: which rows
        // are new, which change and what they change from, and every refusal
        // with its line number. Stored rather than summarized, for the same
        // reason `roster_imports.diff` is.
        { name: "plan", type: "json" },
        { name: "log", type: "text", max: 20000 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE INDEX `idx_stat_imports_created` ON `stat_imports` (`created`)",
      ],
    });

    app.save(imports);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("stat_imports"));
    app.delete(app.findCollectionByNameOrId("player_game_stats"));
  },
);
