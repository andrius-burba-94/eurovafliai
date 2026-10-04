# BasketNews Hostinger league import

Verified 4 October 2026 against [Einikio Kabliai](https://fantasy.basketnews.com/teams/6ab26d119050fb90221c5697). The team's BasketNews league is `Hostinger CA$HiorAI` (`6ab26b799050fb90221bb263`), with nine teams and a 117-pick Modern Draft. It is a distinct league from EuroVafliai 26-27. Source fixtures in `tests/fixtures/basketnews-hostinger.json` contain all nine teams, the draft, and the 27 authenticated lineups and official scores for rounds 1–3. They contain no session cookie.

## Flow and reuse

The league creation action validates the BasketNews team URL, creates a normal league and commissioner membership, and queues a `fantasy_syncs` row. The PM2 worker claims that row, uses the new BasketNews GraphQL reader, then runs `syncBasketNews` through a database-agnostic repository port. The PocketBase adapter reuses the existing draft/pick and membership stores, `planSync`/`applyTransaction`, `writeLineup`, and standings recompute. The source's own score is stored with the round lineup and used for snapshots; league statistics, roster figures, recaps and trade impact read the source player points. Local roster and lineup writes are refused for a source-owned league. The existing league pages and board components render its records.

BasketNews returns `fantasyRound` as a zero-based index. Its roster has five starters, one sixth man, four half-scoring bench players and three inactive players. Captain points double. The sum of weighted player points matched the published team total for all 27 captured team rounds; both are retained in the result payload, and a mismatch blocks writes. The current round is stored without a final score until BasketNews publishes one.

`player_game_stats.basketnews_raw_pts` stores integer hundredths. BasketNews publishes one raw value per player per round while that table has one row per game, so recompute anchors the official round value to the player's first game and leaves later games at zero. A new EuroLeague ingest may calculate a provisional Modern value, then recompute restores the BasketNews value. The league's display reads the round result payload directly.

The session cookie is a server secret (`BASKETNEWS_COOKIE`). Only the worker sends it, and only to the fixed BasketNews GraphQL origin. An expired session fails the job before league records are changed. A worker crash leaves the job running; the next pass resumes from the last completed round. A failed job can be queued again with its saved round cursor. The unique active-job key coalesces repeat clicks and scheduled passes; pick, lineup and snapshot unique indexes make replay safe. No production data was changed during verification.

## Verification

- `npm run lint`, `npm run typecheck`, `npm run test`, and the captured-source worker test passed. The test covers all nine teams, 117 picks, 27 official team totals, current lineups, duplicate refresh, expired session, unresolved player mapping and partial-write recovery.
- The targeted Chromium Playwright test passed against an isolated Next.js checkout and temporary PocketBase copy. It created a BasketNews league from the team URL, confirmed the original league stayed separate, found the queued provider job and rendered the sync page. An isolated production build passed with Webpack.
- The captured 130 distinct BasketNews players each matched exactly one player in the local 390-player pool, with no missing or duplicate mappings.
- Migration up, down and up again succeeded against a temporary copy of `pb/pb_data/data.db`. A temporary PocketBase server processed the captured source through the real API: nine members, 117 picks, 36 lineups (three completed rounds plus the current round), three standings snapshots, and all 27 stored scores equal BasketNews.
- A real PocketBase recompute then restored 208 nonzero official raw-point rows in `player_game_stats`; all 27 snapshot round totals still matched BasketNews after that pass.
- `EXPLAIN QUERY PLAN` on the migrated copy showed indexed searches for queued jobs (`idx_fantasy_syncs_queue`), retry history (`idx_fantasy_syncs_league_provider_status`), member lineups (`idx_round_lineups_member_round`), league round results (`idx_round_lineups_league_season_round`) and snapshots (`idx_standings_snapshots_league_season_round`). The tiny local `leagues` table was scanned for the scheduled source-league list; `idx_leagues_basketnews_team` supplies the partial unique source-ID constraint and can serve that filter as the table grows.

## Activation

Deploy the migration and worker code, set a current BasketNews session in the worker's `BASKETNEWS_COOKIE`, then create a BasketNews Draft league named `Hostinger CA$HiorAI` with the Einikio Kabliai team URL. The initial sync is queued automatically. The BasketNews sync page reports success, mapping questions or an expired session. A session renewal needs only an environment update and another queued pass; stored league data remains intact.
