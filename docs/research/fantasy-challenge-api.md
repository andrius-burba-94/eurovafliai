# EuroLeague Fantasy Challenge API

Checked against the real service on **30 September 2026**, signed in as the
league's commissioner. Unofficial and undocumented: everything here is what the
web app at `euroleaguefantasy.euroleaguebasketball.net` calls, and can change.

## Access

- Base: `https://fantaking-api.dunkest.com/api/v1`, `game_id` 10.
- Auth: `Authorization: Bearer <token>`, an opaque session token from a
  signed-in browser (DevTools → any `fantaking-api` request). Lifetime unknown.
- `POST /login` exists but refuses an account created through EuroLeague SSO
  (422), and the SSO login itself sits behind a Vercel challenge (429). So the
  app uses the token, `FANTASY_CHALLENGE_TOKEN`.
- A `401` is a refused token; `403` on another manager's team endpoints,
  except the lineup preview below.

## What we read

`GET /fantasy-leagues/{leagueId}/rosters` → `{ data: Team[] }`, every team in
the league with its full current roster, in one call:

- `Team`: `id`, `name`, `credits`, `user { first_name, last_name }`, `players[]`.
- `Player`: `id`, `first_name`, `last_name`, `jersey`, `position { name: Guard | Forward | Center }`,
  `team { id, name, abbreviation }` (the Euroleague club).

Club names matched ours exactly for all twenty clubs; abbreviations mostly did
not (`RMB` vs `MAD`). Some first names are nicknames ("Rj Cole" for "Cole,
Robert Jalen"); surnames and jerseys are what match.

Roster caps are the official game's, not our draft template: 13 players, at
most 7 G, 7 F, 5 C.

## Round lineups (checked 1 October 2026)

`GET /fantasy-teams/{teamId}/matchdays/{matchdayId}/roster/preview` answers
**200 for any team in the token owner's league**. The plain `/roster` (the
owner's edit view) and `/matchdays/{id}` answer 403.

- Top level: `formation_id`, `pts` (the team's round total as the official
  table counts it), `players[]`.
- Each player: the roster `Player` fields above plus `court_position`,
  `is_captain`, `pts`, `round { id, number }`.
- Decoding: `court_position` 1–5 are the starting five (the captain is one of
  them), 6 the sixth man, 7–10 the bench. The three inactive players are **not
  in the list**: they are whoever on that round's roster it does not name.
- `formation_id`: 27 = 2-2-1, 28 = 2-1-2, 30 = 1-3-1, 31 = 3-1-1 (G-F-C), all
  seen in round 2. 1-2-2 was not seen; the sync never reads the id, it counts
  the starters' positions.
- A player's `round.number` is the Euroleague round of the game he scored in,
  so a postponed game shows round 1 inside matchday 1529. It cannot confirm
  which matchday a response is for.

Checked against `GET /tournaments/214586/standings?matchday={id}` (the official
round table): captain ×2, starters and sixth man ×1, bench ×0.5, inactive ×0 on
the players' `pts` reproduced **all 16 team-rounds** of rounds 1–2 exactly
(round 2: 159.9, 149.15, 140.55, 139.15, 127.25, 110.9, 95.25, 94.15).

Matchday ids are one per round: `1528` round 1, `1529` round 2, `1530` round 3.
The sync takes the current one from
`GET /user/fantasy-teams?league=10&game_mode=2` (the token owner's teams, each
with `fantasy_league.id` and `matchday { id, number }`) and counts other rounds
from it. The game does list its matchdays, publicly: see "Player pool" below.

## The move log (checked 9 October 2026)

`GET /fantasy-leagues/{leagueId}/fantasy-trades?matchday={id}` →
`{ data: Move[] }`, every team's moves for that matchday. The sync reads it
whenever the rosters differ (`fetchLeagueMoves`, `planFromLog`).

- `Move`: `id`, `player_1`, `player_2`, and nothing else: no time, no type.
- `player_1` is the arrival, `player_2` the departure. Each carries the roster
  `Player` fields (no `position` or `team`) plus `fantasy_team { id, name }`:
  **the team that player went to**. So a trade names both teams, and a
  free-agent swap has `player_2.fantasy_team` null. `player_2` may also
  carry `credits`.
- A two-for-two trade is two rows, one pair of players each.
- Ids rise in the order moves were made. That is the only ordering there is.
- The matchday is the round the move counts from: matchday 1531 (round 4) held
  the round-4 moves, including Laurynas Birutis sending Theis to Birka Ne
  Plugas (`1271182`) and Birka releasing him for Diarra (`1271190`).
- A released player is on no roster, so his official id resolves only through
  `players.fantasy_id`, which an earlier pass linked while he was rostered.

## Seen, not used

- `GET /tournaments/214586/standings?matchday={id}`: the official round table,
  used above to check the decoding by hand. The sync's report sets our round
  total beside each lineup's own `pts` instead.

## Player pool (checked 9 October 2026)

Found in the web app's bundle (`/{build}.main.dart.js`, which is a Flutter
build). The 9 October request used the current matchday, 1531 (round 4).

**Which list and matchday to read.** `GET /leagues/10/config` is **public**,
with no token. It gives:

- `current_players_list_id` (49) and `current_competition_id` (49);
- `current_matchday { id, number, num_rounds }` and `previous_matchday { id, number }`;
- `matchdays[] { id, number }`: every matchday of the season, `1528` = 1
  upward;
- `teams[]`: the 20 clubs, `{ id, name, abbreviation }` plus jersey and logo
  URLs.

**The pool.** `GET /players-lists/{listId}/matchdays/{matchdayId}/players`
needs the Bearer token (401 without it):

- Query: `per_page`, `page`, `sort_by` (`first_name` | `last_name` |
  `quotation` | `popularity` | `avg_points`), `sort_order`, and an optional
  `fantasy_league={leagueId}`.
- Paging: Laravel-style `meta { current_page, last_page, per_page, total, from,
  to, links }`. `per_page=500` returned all 356 rows on one page, and
  `per_page=50` returned the same 356 over 8 pages.
- `data[]`, one row per player:
  - `id`: the same id as the roster `Player.id` (all 104 rostered players
    matched), so it is what `players.fantasy_id` links;
  - `first_name`, `last_name`, `jersey`;
  - `position { id, name }`: Guard 28, Forward 29, Center 30, **Head Coach 31**;
  - `team { id, name, abbreviation, position: home | away }` and
    `opponent { id, name, abbreviation }`: his club's game in this matchday;
  - `round { id, number }`: that game's game day within the matchday, 1 to
    `num_rounds`. Ids run on across matchdays: 2523 and 2525 in 1528,
    2530–2532 in 1531, 2533–2534 in 1532. The lineup preview's `round`
    has the same shape, and "Round lineups" above reads it as the EuroLeague
    round. The two readings have not been reconciled; nothing reads either
    field;
  - `is_injured` (bool), `probability_of_playing` (0, 0.5 or 1);
  - `quotation`, `avg_pts`, `popularity`, `is_on_fire`,
    `started_from_bench`, `label`, `face_path`;
  - `fantasy_team`: `null`, or `{ id, name }` when `fantasy_league` is passed
    and a team in that league holds him.
- The list holds every club's coach as a player row. All 20 had position
  `Head Coach`, so a positions read drops that position.

On 9 October, matchday 1531 held 356 rows: 151 G, 119 F, 66 C and 20 coaches,
across all 20 clubs.

- With `fantasy_league` set to our league, 104 rows had a `fantasy_team`
  (8 teams × 13) and 252 did not.
- That leaves **232 free agents** (252 minus the 20 coaches).
- 33 rows were `is_injured`, all with `probability_of_playing` 0.

**A player the game does not list has no row.** There is no "left" status or
inactive flag.

- Matchday 1528 (round 1) held 351 rows. The 5 extra rows on 1531 are later
  signings (Dunston, Papas, Payne, Santos, Sy).
- No position changed between the two matchdays.
- A matchday lists a club's players only once that club's game is placed on one
  of its game days. The next matchday (1532) listed only 14 of the 20 clubs
  (252 rows).
- Begarin (ASVEL) is in BasketNews's pool but in neither matchday here.

So a positions read uses **`current_matchday`**, never a future one. If a club
were ever missing from the current matchday, absence alone would not prove
that its players are unlisted.

**Positions against BasketNews.** Matching surname and jersey paired 263 of the
336 players with BasketNews's pool. 23 differ, Omoruyi included (F here, C
there). See `basketnews-api.md`.

Fixture: `src/lib/fantasy/fixtures/player-pool-api.json`, the raw 356-row
response for matchday 1531 with `fantasy_league` set. It contains no token.

Also seen, not needed:

- `/competitions/{id}/stats/players/table`: stats with filters, token only.
  It answered 422 to a guessed `sort_by`.
- `/players/{id}/fantasy-pts`, `/profile`, `/trend`: per-player reads.
