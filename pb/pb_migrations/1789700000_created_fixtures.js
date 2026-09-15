/// <reference path="../pb_data/types.d.ts" />

// Phase 10.7 — `fixtures`: the half of the schedule the app has been throwing
// away since 4.3.
//
// `fetchSeasonSchedule` has always read the *whole* season — about 400 games,
// both club codes, the round, the kickoff and the scores — and `ingest.ts`
// dropped everything that had not been played at `.filter((game) =>
// game.played)`. So the app could say what happened and never what is about to:
// "who does he play next" and "how hard is the draw" had no data behind them,
// and `player_game_stats` cannot answer them either — it stores the opponent's
// *score* and never the opponent's identity.
//
// ## Fixtures, not games
//
// This collection is the schedule as the schedule, which is why it duplicates a
// few columns `player_game_stats` also carries. The two answer different
// questions and are keyed differently: a box-score row is one player in one
// game, keyed `(player, season, game_code)`; a fixture is one game, keyed
// `(season, game_code)`. Deriving one from the other would mean deriving
// tomorrow from rows that only exist once tomorrow has happened.
//
// ## `unique(season, game_code)` is the whole failure-recovery story
//
// PocketBase has no transactions and a pass writes up to 400 rows, so the same
// rule the box-score import follows applies here: the index is the physical
// backstop, the write is an upsert keyed on it, and a pass that dies halfway
// has stored a prefix. The next pass — fifteen minutes later, unprompted —
// plans exactly the remainder, because the plan is "what does the feed say that
// the database does not". A create that loses a race to a concurrent pass comes
// back `validation_not_unique` and is read and updated instead.
//
// `(season, round)` is indexed but **not** unique: a round holds ten games. It
// is deliberately not unique on `(season, round, local_club)` either — that
// would encode "a club plays once a round", which is true of every one of the
// 1,564 club-rounds measured across E2025 and E2026 and is still the
// competition's business rather than ours. See docs/research/euroleague-api.md.
//
// ## Scores are stored on an unplayed game too, as noughts
//
// An unplayed game answers 200 with `0–0` (docs/research/euroleague-api.md), so
// `played` is the only field that separates "nobody has played yet" from "a
// game ended 0–0", which no Euroleague game ever has. Difficulty is derived
// from played games only, and reads `played` to know which those are.
//
// ## Reads use the viewer's token; writes are superuser-only
//
// Reference data, like the pool and the box scores: the same fixtures for every
// league, readable by any signed-in member, written only by the worker and the
// sync script.
//
// Rollback: drop the collection. Nothing else stores a fixture, and the next
// ingest pass rebuilds all of it from one request.

migrate(
  (app) => {
    const signedIn = '@request.auth.id != ""';

    const collection = new Collection({
      type: "base",
      name: "fixtures",
      listRule: signedIn,
      viewRule: signedIn,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        // "E2026". Per row rather than inferred from the date, because the
        // season is what makes `game_code` unique.
        { name: "season", type: "text", required: true, max: 12 },
        {
          name: "game_code",
          type: "number",
          required: true,
          onlyInt: true,
          min: 1,
        },
        // 1–47 in a season with a Final Four, like the box scores. Not capped
        // at 38.
        { name: "round", type: "number", required: true, onlyInt: true, min: 1 },
        {
          name: "phase",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["RS", "PI", "PO", "FF"],
        },
        // Club codes as the feed spells them (`ZAL`, `IST`), which is the same
        // vocabulary `players.club_code` uses — that agreement is what lets a
        // roster block find its own club's next game.
        { name: "local_club", type: "text", required: true, max: 8 },
        { name: "road_club", type: "text", required: true, max: 8 },
        { name: "played", type: "bool" },
        // `required: false` on both, because a genuine nought is most of this
        // table and PocketBase's `required` is a truthy check.
        {
          name: "local_score",
          type: "number",
          required: false,
          onlyInt: true,
          min: 0,
        },
        {
          name: "road_score",
          type: "number",
          required: false,
          onlyInt: true,
          min: 0,
        },
        // The feed's own ISO timestamp, or empty when it has not scheduled the
        // game yet. Text rather than a date field for the reason the news
        // items' `published` is text: "unknown" has to be storable, and a
        // missing kickoff must not become 1970.
        { name: "utc_date", type: "text", max: 40 },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_fixtures_game` ON `fixtures` (`season`, `game_code`)",
        "CREATE INDEX `idx_fixtures_round` ON `fixtures` (`season`, `round`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("fixtures"));
  },
);
