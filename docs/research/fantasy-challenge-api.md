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
- A `401` is a refused token; `403` on another manager's team endpoints.

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

## Seen, not used

- `GET /fantasy-leagues/{id}/fantasy-trades?matchday={id}`: moves per matchday,
  `player_1` acquired and `player_2` released. Matchday `1528` was round 1 and
  `1529` round 2. A future backfill would read this.
- Other managers' lineups (`/fantasy-teams/{id}/...`) answer 403, so lineups
  stay in Eurovafliai.
