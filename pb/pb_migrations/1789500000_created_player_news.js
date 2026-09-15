/// <reference path="../pb_data/types.d.ts" />

// Phase 9.4 — `player_news`: the fact, not the article.
//
// The Euroleague feed has no injuries or news resource (both 404), so the only
// source of "is he playing on Thursday" is a publisher. What is stored here is
// therefore deliberately narrow: who, which body part, what the item asserts
// about availability, the date, the publisher's own headline, and the URL. The
// prose stays where it was written and every surface links out to it. A
// ten-person private app does not mirror a subscription publisher's copy.
//
// `source_key` is the item's identity as the publisher expresses it — their
// player slug, the date and the headline — so re-reading the same page every
// hour updates one row instead of stacking twenty-four copies of one injury.
// Unique `(source, source_key)` is the physical backstop under that, the same
// role `unique(player, season, game_code)` plays for box scores.
//
// `player` is a relation and is deliberately OPTIONAL. A name the pool cannot
// match is stored unattached and raises the 4.2 mapping queue rather than being
// dropped: a silently discarded news item is an injury nobody hears about.
//
// `applied` records that this item is what set the player's status. It is the
// guard that makes "the commissioner marked him fit again" stick — without it
// the next pass would read the same three-week-old item and flag him a second
// time, every hour, forever.
//
// Deliberately NOT stored, and not written anywhere else: the club. The item
// carries one ("Free Agent", "FC Bayern Munich") and it is kept here as text
// for a person to read, but the roster sync remains the only authority on
// `players.club_code` — the publisher's club vocabulary is its own (`EFS` for
// Anadolu Efes, where the Euroleague says `IST`) and a transfer rumour is not
// a registration.
//
// Rollback: drop the collection. Statuses already written stay as they are —
// they are commissioner-correctable facts about players, not news rows.

migrate(
  (app) => {
    const players = app.findCollectionByNameOrId("players");

    const collection = new Collection({
      type: "base",
      name: "player_news",
      // Reference data, like the pool itself: the same items for every league,
      // read with the reader's own token, written only by the worker.
      listRule: '@request.auth.id != ""',
      viewRule: '@request.auth.id != ""',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        {
          name: "source",
          type: "select",
          required: true,
          maxSelect: 1,
          values: ["rotowire"],
        },
        { name: "source_key", type: "text", required: true, max: 200 },
        // The publisher's own player key, which outlives any one item: once a
        // human has said which player a slug is, every later item under it
        // attaches without being asked again.
        { name: "slug", type: "text", required: true, max: 120 },
        {
          name: "player",
          type: "relation",
          required: false,
          maxSelect: 1,
          collectionId: players.id,
          cascadeDelete: true,
        },
        { name: "name", type: "text", required: true, max: 120 },
        { name: "club_name", type: "text", max: 80 },
        { name: "position", type: "text", max: 8 },
        { name: "body_part", type: "text", max: 40 },
        { name: "headline", type: "text", required: true, max: 200 },
        { name: "url", type: "text", required: true, max: 300 },
        // ISO `YYYY-MM-DD`, or empty when the publisher used a form we do not
        // read. Text rather than a date field because "unknown" has to be
        // storable — a missing date must not become 1970.
        { name: "published", type: "text", max: 10 },
        {
          name: "status",
          type: "select",
          required: false,
          maxSelect: 1,
          values: ["injured", "doubtful"],
        },
        { name: "applied", type: "bool" },
        { name: "created", type: "autodate", onCreate: true, onUpdate: false },
        { name: "updated", type: "autodate", onCreate: true, onUpdate: true },
      ],
      indexes: [
        "CREATE UNIQUE INDEX `idx_player_news_item` ON `player_news` (`source`, `source_key`)",
        "CREATE INDEX `idx_player_news_slug` ON `player_news` (`source`, `slug`)",
      ],
    });

    app.save(collection);
  },
  (app) => {
    app.delete(app.findCollectionByNameOrId("player_news"));
  },
);
