# The Euroleague API — confirmed working

**Question:** slice 2.1 assumes an API exists that can give us 2026-27 club
rosters with names, `person_code`s and positions. Does it, and does it work?

**Answer: yes.** Verified by request, not by documentation, on 2026-08-31. Every
figure below came out of a live call — the probes are reproducible from the
`curl` lines in each section.

> Verify before trusting this file again. An API that worked in August can
> change by October, and the one number that matters — how many players still
> lack a `person_code` — moves as clubs register signings.

## The endpoint

```
https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/clubs
https://api-live.euroleague.net/v2/competitions/E/seasons/E2026/clubs/{CLUB}/people
```

- **v2 is current.** v3 is rejected outright with
  `UnsupportedApiVersion`, so do not reach for it.
- **No authentication.** No key, no token, no referer check.
- **There IS a rate limit.** This file originally said "~50 requests during this
  investigation, none refused", and read that as no limit. There is one:
  building slice 2.1 meant running the 21-request sync repeatedly, and somewhere
  past ~100 requests in a few minutes the feed started answering **429 Too Many
  Requests** — on `/clubs`, the very first call. It clears on its own after a
  few minutes.
  So the sync spaces its club requests (150ms) and retries 429 and 5xx with
  backoff, honouring `Retry-After`. Do not treat an absence of refusals at low
  volume as an absence of a limit — and note this makes a naive "sync on every
  page load" design impossible, which is one more reason ingestion is a script.
- `E2026` is the 2026-27 season. Every roster row confirms it in-band:
  `season.name` is literally `"EuroLeague 2026-27"`.
- The `incrowdsports` feed (`feeds.incrowdsports.com/provider/euroleague-feeds/v2/…`)
  serves the same shape and is presumably the origin. Prefer `api-live`.

A roster is a **bare JSON array**, not a `{data: […]}` envelope — unlike
`/clubs`, which is enveloped. Easy to get wrong; the two differ.

## What one roster row contains

```json
{
  "person": {
    "code": "009549",
    "name": "CORDINIER, ISAIA",
    "alias": "CORDINIER, ISAIA",
    "jerseyName": "CORDINIER",
    "abbreviatedName": "Cordinier, I.",
    "country": { "code": "FRA", "name": "France" },
    "height": 196, "weight": 90,
    "birthDate": "1996-11-28T00:00:00"
  },
  "type": "J", "typeName": "Player",
  "active": true,
  "startDate": "2025-08-31T00:00:00+02:00",
  "endDate":   "2027-08-31T00:00:00+02:00",
  "dorsal": "10",
  "position": 1, "positionName": "Guard",
  "club": { "code": "IST", "name": "Anadolu Efes Istanbul" },
  "season": { "name": "EuroLeague 2026-27" }
}
```

`person.code` is the `person_code` the blueprint wants for exact stats joins.

**Filter by `type == "J"`.** Each club's response also carries its coach
(`type: "E"`, `typeName: "Coach"`) — 20 coaches across the league, one per club.
An ingest that skipped this filter would put 20 coaches in the draft pool.

> Corrected on 2026-08-31 during slice 2.1: this file first recorded the coach
> type as `"T"`. It is **`"E"`**. The prescribed filter — *include* `type == "J"`
> — was right either way, which is why the error was harmless; an *exclusion*
> filter written from the wrong code (`type !== "T"`) would have drafted twenty
> coaches. Include, never exclude.

## The sweep — all 20 clubs, E2026

**Re-verified 2026-08-31** at the start of slice 2.1, per the warning above.
Every figure below still holds exactly: 344 rows, 324 players, 20 coaches, 43
players without a `person_code`, no code on two clubs, positions still only
Guard / Forward / Center, and the same per-club counts.

| | |
|---|---|
| Clubs | 20 |
| Players (`type == "J"`) | **324** |
| Coaches, correctly excluded | 20 |
| Squad sizes | 13–20 per club |
| Players missing a position | **0** |
| Person codes appearing on two clubs | **0** |
| Players missing a `person_code` | **43 (13%)** |

Per club: `IST 18 · MIL 15 · BES 14 · RED 18 · DUB 18 · BAR 14 · MUN 16 ·
ULK 16 · HTA 20 · BAS 13 · ASV 15 · TEL 16 · OLY 17 · PAN 18 · PRS 18 ·
PAR 16 · MAD 17 · PAM 15 · VIR 15 · ZAL 15`

324 sits just under the blueprint's "~350+ pool players", which is close enough
that the fuzzy-search and pool-filter assumptions in Phase 3.3 hold.

## Three findings that change how 2.1 should be built

### 1. Positions are already exactly G / F / C

The vocabulary across all 324 players is **Guard (142), Forward (114),
Center (68)**. Nothing else. No `"Guard-Forward"`, no `"F/C"`, no blanks.

The blueprint anticipates *"'Guard-Forward'-style listings map to a single
`G|F|C` bucket by rule, admin-overridable"*. For the **API** path that rule has
nothing to do — a straight `Guard→G, Forward→F, Center→C` map is total.

Keep the rule anyway, for the **CSV** path: a hand-made spreadsheet absolutely
will contain `G/F`. But do not let it complicate the API path, and do not treat
an unmapped API position as normal — if one ever appears, that is news and
should fail loudly rather than default to a bucket.

### 2. 13% of players have no `person_code` yet

43 of 324, concentrated in recent signings — `MIL: BURNELL, JASON`,
`BES: NOWELL, JAYLEN`, `RED: BALDWIN JR, PATRICK`, `BAR: EVBUOMWAN, TOSAN` and
so on.

This is **not** a blocker, and the blueprint already designed for it: *"match by
`person_code` when present, else by `name_normalized` + team"*. But it does make
that fallback the common path rather than an edge case, so:

- the name-normalisation must be good on day one, not later — diacritics folded,
  `Valančiūnas` findable as `valanciunas`;
- a re-sync closer to the season will fill codes in, so the merge rule *"a
  later import never nulls an existing `person_code`"* has to work in the
  API→API direction too, not just CSV→API;
- expect the count to fall as clubs register. Re-run the sweep before draft
  night rather than trusting this number.

Names arrive as `"SURNAME, FIRSTNAME"`, uppercase. `passportName` /
`passportSurname` are available separately, which is a cleaner source than
splitting the display string.

### 3. The 2026-27 club list is not last season's

`E2026` differs from `E2025` by one club: **Monaco (MCO) out, Beşiktaş (BES)
in**. Whether that is final or provisional this far from tip-off, it means the
club list must be read from the API per season and never carried over.

## Phase 4 (stats) — the box score, found and checked

Verified by request on **2026-09-08**, while building slice 4.1. The earlier
version of this section said a box-score feed "exists in this family" and that
pinning the path was Phase 4's job. It is pinned:

```
https://api-live.euroleague.net/v2/competitions/E/seasons/E2025/games/{gameCode}/stats
https://api-live.euroleague.net/v2/competitions/E/seasons/E2025/games/{gameCode}
https://api-live.euroleague.net/v2/competitions/E/seasons/E2025/games?limit=500
```

`/games/{code}/stats` answers **200** with `{local, road}`, each carrying
`coach`, `players[]`, `team` and `total`. A player row is
`{player: {person: {code, …}, club, …}, stats: {…}}` with 27 stat fields.
`/boxscore`, `/players` and `/report` are all wrong guesses — 405, 404 and
`UnsupportedApiVersion`.

### PIR is published, and our formula reproduces it exactly

`stats.valuation` **is** PIR. So the scoring engine does not have to be trusted:
it can be checked against the Euroleague's own arithmetic, which is what
`scoring.golden.test.ts` does.

```
points + totalRebounds + assistances + steals + blocksFavour + foulsReceived
  − (fieldGoalsAttemptedTotal − fieldGoalsMadeTotal)
  − (freeThrowsAttempted − freeThrowsMade)
  − turnovers − blocksAgainst − foulsCommited
```

Checked across **168 real player rows in 7 games** (E2025 games 1, 2, 3, 50,
137, 200, 300 — rounds 1, 1, 1, 5, 14, 20, 30) **plus all 14 team totals**:
**zero mismatches**. Note `foulsCommited` is spelled with one `t` in the feed,
and `blocksFavour`/`blocksAgainst` are from the *player's* point of view.

### `winner` is the season's champion, not the game's winner

The one finding that would have become a silent bug. `/games/{code}` carries a
`winner` object, and it is **the same club on every game in the season**:

| game | round | result | `winner` field |
|---|---|---|---|
| 1 | 1 | IST 85 – 78 TEL | `OLY` |
| 2 | 1 | BAS 96 – 102 OLY | `OLY` |
| 3 | 1 | RED 82 – 92 MIL | `OLY` |
| 50 | 5 | PRS 88 – 89 HTA | `OLY` |
| 137 | 14 | RED 79 – 89 BAR | `OLY` |
| 200 | 20 | MUN 96 – 89 BAS | `OLY` |
| 300 | 30 | OLY 86 – 80 PAN | `OLY` |

Five of seven disagree with the scoreline. **Derive the win from
`local.score` vs `road.score` and never read `winner`** — it matters because the
win is what the ×1.1 fantasy bonus hangs on, so trusting it would have given
every Olympiacos player a bonus in all 38 rounds and nobody else one, ever.
Worth noticing *how* this was nearly missed: the two rows that agree are
coincidences where Olympiacos won that night, so a three-game sample had a
decent chance of looking fine. Game 1's `venue` is also wrong (Podgorica, for
an Efes home game), so the non-scoreline metadata on that record is suspect
generally.

### An unplayed game answers 200 with nothing in it

E2026 game 1 (2026-09-24, `played: false`) returns
`{"local":{"coach":null,"players":[],"team":null,"total":null},"road":{…}}` —
**200, not 404** — and `/games/1` reports `score: 0` for both clubs. So "no data
yet" and "everybody scored nothing" are the same HTTP response, and a derived
winner would read `0 – 0` as a tie. Gate on `played` before reading a box
score; an empty `players[]` is not a game where nobody did anything.

### Rounds and phases

E2025: **402 games, rounds 1–47.** Regular season is `phaseType.code: "RS"`,
rounds **1–38**, 380 games, exactly 10 a round. Then play-in `PI` (39–40),
playoffs `PO` (41–45) and Final Four `FF` (46–47). `gameCode` is unique within
a season and runs 1–406 with gaps, which is what makes
`unique(player, season, game_code)` the right physical key.

E2026 tips off **2026-09-24**.

## What this means for slice 2.1

Both front doors, as the blueprint describes — one shared
normalize → diff → apply pipeline:

- **API sync** is viable now and should be the summer-long default.
- **CSV upload** stays, and is still what gets used in the 24 hours before the
  draft, because it is the one source that cannot go down or change shape on
  the night.

The `roster_authority: api | csv` switch is therefore worth building exactly as
specified: the API is good enough to trust all summer, and not something to bet
draft night on.
