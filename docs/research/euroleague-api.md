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
- **No authentication.** No key, no token, no referer check. ~50 requests
  during this investigation, none refused.
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
(`type: "T"`, `typeName: "Coach"`) — 20 coaches across the league. An ingest
that skipped this filter would put 20 coaches in the draft pool.

## The sweep — all 20 clubs, E2026

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

## Phase 4 (stats) — de-risked, not solved

Checked only far enough to know the season is not going to dead-end:

- `…/seasons/E2025/games` — **200**, full schedule with game codes
- `…/v1/results?seasonCode=E2025&gameNumber=1` — **200**, XML results
- `…/v2/competitions/E/statistics/players/traditional?…` — **400**, so that
  particular guess is wrong

A box-score/PIR feed exists in this family, but pinning down the exact path is
Phase 4's job. Do not assume the URL above.

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
