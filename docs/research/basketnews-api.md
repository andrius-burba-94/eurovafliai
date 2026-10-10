# BasketNews Fantasy API

GraphQL at `https://fantasy.basketnews.com/backend/graphql`. Introspection is
disabled, but "Did you mean" suggestions are on, and the site's Next.js chunks
carry every query document the web app sends. The field names below come from
those two sources.

## Transfer log (checked 9 October 2026)

Checked without a session. Not read by the sync yet (see STATUS.md, debt).

`draftTransfersFromClient(fantasyLeagueId: String!, fantasyRound: Int!)` →
`[DraftTrade]`, public: an unknown league answers `fantasyLeagueNotFound`, not
an auth error.

- `DraftTrade`: `id`, `type` (`free_agent` seen), `status` (`accepted` seen),
  `createdAt`, `updatedAt`, `fantasyLeagueId`, `offer`, `request`.
- `offer` / `request`: `DraftTradeItem { id, fantasyTeamId, fantasyTeam { id title }, players }`.
  A free-agent swap has a null `request` team.
- `players`: `[DraftTradePlayer] { playerId, player { id firstName lastName } }`.
- `fantasyRound` looks like the round a transfer was made in, so a round's
  moves sit under the round before. The Hostinger league
  (`6ab26b799050fb90221bb263`) returned moves for rounds 1–3 and none for 4–6
  on 9 October. Round 3's six free-agent swaps were all `updatedAt`
  7 October 15:49 UTC: processed together, created between 3 and 7 October.

## Player pool (checked 9 October 2026)

Checked without a session: the whole pool is **public**. The query is the one
behind the site's player search.

```graphql
query($leagueId: String!) {
  playersSearchRecordsFromClient(leagueId: $leagueId) {
    records {
      id firstName middleName lastName health
      team(leagueId: $leagueId) {
        teamId status number positions
        team { id abbreviation translation(locale: "en") { name } }
      }
    }
  }
}
```

**Arguments and paging.**

- `leagueId` is the BasketNews **source league** (`leagueId` on the fantasy
  league record, `6a7ae0128b647e038c999860` for EuroLeague 2026-27), not the
  fantasy league.
- Optional arguments: `position`, `teamId`, `search`, `fantasyRound`.
- There is no paging. One response returned **331 players** across all 20
  clubs, with no duplicate ids.
- `position: "guard"` returned exactly the 153 guards.

**Fields.**

- `id` is the same 24-hex player id the draft picks and lineups use. All 117
  draft picks are in the pool.
- `team.positions` held exactly one of `guard` | `forward` | `center` for every
  player: 153 G, 106 F, 72 C.
- `team.status` was `active` for all 331 players.
- `health` takes the values `ready` 247, `out` 43, `uncertain` 36,
  `game-time` 4, `expected` 1.
- The Fantasy Challenge's equivalent is `is_injured` with
  `probability_of_playing`. Which `health` values count as "injured or out" for
  the scout is the advisor's decision. Only `out` is unambiguous.

**`fantasyRound`.** Leaving it out reads the current round.

- `fantasyRound` 0, 3, 4, 5 and 37 all returned the same 331 players.
- From round 3 on, every player had a team, with the same club and position as
  the current read.
- At round 0, six later signings answer `team: null`, so they have no
  position: Dunston, Sy, Begarin, Santos, Payne and Papas. A positions read
  therefore leaves `fantasyRound` out.
- Begarin is listed here but not by the Fantasy Challenge, on any matchday.
- A player BasketNews does not list has no row at all.

**The league's own free agents** come from a separate query,
`availableFreeAgentsFromClient(fantasyLeagueId, locale)`. It is also public.

- Each row has `id`, names, `health`, `previous_fantasy_pts`,
  `average_fantasy_pts`, and `team { teamId positions team { … games } }`.
- It returned 214 players: exactly the pool minus the 117 rostered players, and
  none outside the pool.
- So "pool minus rosters" and BasketNews's own list agree. The scout can derive
  free agents from the pool and the synced rosters.

Fixture: `tests/fixtures/basketnews-player-pool-api.json`, which holds the query,
its variables and the raw 331-player response. No session was used.

## Modern scoring has a win term: +1.5 a win, -1.5 a loss (checked 9 October 2026)

Modern scoring has a flat team-result term: **+1.5 for a win, -1.5 for a
loss**. It is an addition, not a percentage. This is the term
`scoreBasketNewsModern` already has (`stats/scoring.ts`), which until now had
no source.

**Evidence.** BasketNews's own per-player points were compared with the
EuroLeague feed's box scores for every played game of rounds 1–4 (887 lines).

- BasketNews's points come from
  `fantasy_pts(leagueId, pointCalcSystem: "modern", fantasyRound)` on the pool
  query above, for each round.
- Players were matched by name inside each round, which gave **607 player-games**
  with a single game in the round.
- **605 of 607** equal the formula with the ±1.5 term exactly.
- **0 of 607** equal it without the term.
- Of the 605: 310 wins at +1.5 and 295 losses at -1.5. They include 8
  multi-category bonuses and 9 foul-outs.
- The two misses are 1 and 1.5 points off: Feliz in round 1 and Massa in
  round 2. Neither is explained yet.
- The stored local `basketnews_raw_pts` were not used as evidence. A local
  ingest can compute them with this same formula, which would make the check
  circular.

**For the scout.** The Fantasy Challenge's win bonus multiplies (×1.1). This
one adds. So a BasketNews outlook adds `1.5 × (2 × win chance − 1)` per game,
not `× (1 + 0.1 × win chance)`.

## The scout's threshold in Modern points (measured 9 October 2026)

PRD #190 sets the scout's bar at a gain of **+3.0 fantasy points per game**. In a
BasketNews league the same bar is **+3.4 Modern points per game**.

**Which players.** The players are the Hostinger league's own pool: every player
its game lists. These are the players its rosters and free agents are drawn
from, and BasketNews scores them all the same way. Restricting the sample to
the 117 rostered players would leave out the free agents, which are the very
players a gain is measured against.

**Method.** A gain is a difference between two players' per-game outlooks. The
two units are therefore scaled by the spread of per-player averages: the ratio
of their standard deviations across the league's player pool.

- Each player's Modern average was taken from BasketNews's official figures.
- Each player's fantasy-point average was computed from the same games
  (`scoreGame`, PIR × 1.1 on a win).

| Sample | Players | sd FP | sd Modern | r | sd ratio | +3.0 FP in Modern |
|---|---|---|---|---|---|---|
| E2026 rounds 1–4, official Modern, ≥3 games | 160 | 5.83 | 6.53 | 0.980 | 1.119 | 3.36 |
| E2026 rounds 1–4, official Modern, ≥1 game | 184 | 5.90 | 6.73 | 0.979 | 1.140 | 3.42 |
| E2025 regular season, Modern by formula, ≥10 games | 199 | 5.11 | 5.65 | 0.990 | 1.106 | 3.32 |

**The other ways of scaling agree.**

- Ordinary least squares of Modern on FP gives 3.29, 3.35 and 3.28.
- Per game, the standard-deviation ratio is 1.125 this season and 1.113 last
  season.

**Not used: the ratio of means** (1.32, which would give 3.98). Modern's mean
sits higher because of terms most players collect: fouls drawn, offensive
rebounds at 1.5, and the ±1.5 win term. Those terms raise every player's
average. They widen the gap between two players far less, and the standard
deviations already include whatever spread they do add. A gain is a gap, so
the ratio of spreads is the right scale.

**Chosen: 340 hundredths (+3.4)**. That is the live league's measurement,
3.36, rounded to one decimal. The full last season gives 3.32, so the choice
does not depend on four rounds of data.
