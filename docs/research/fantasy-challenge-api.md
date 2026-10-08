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
The game lists no matchdays, so the current one comes from
`GET /user/fantasy-teams?league=10&game_mode=2` (the token owner's teams, each
with `fantasy_league.id` and `matchday { id, number }`) and other rounds are
counted from it.

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
