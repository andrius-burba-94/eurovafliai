# Game-day sync and frozen roles, 16 October 2026

## What started it

Hostinger CA$HiorAI stopped syncing on 14 October: every BasketNews pass
refused round 5 because Tinginiai's lineup added up to 127.25 against an
official 141 (#208 keeps the official score instead). The 13.75 gap is exactly
Gach, now inactive, counting in full while Jones and Luwawu-Cabarrot did not —
a lineup change between round 5's Tuesday and Wednesday. Fantasy Challenge had
carried the same problem since S35 as debt: Montero, round 3, captain on day
1 and benched on day 2, 50 here against 62 official.

## Why one read per game day

The official games lock each player at his own tip-off, so only a read after
every distinct tip-off (three to five a game day) freezes every player
exactly. The maintainer chose one read per game day, five minutes after its
first tip-off. That read freezes the day's later games too, so a change made
between the day's first and last tip-off for a later game is missed. The far
more common change — moving a player, or the armband, after his game — can no
longer reach him.

The schedule reads, per round: once per game day, once when the round has
settled (last tip-off + 3 h, when its games are final and scored), and every
six hours between rounds so a transfer arrives before the next round tips
off. BasketNews used to queue a job every fifteen minutes around the clock;
Fantasy Challenge read rosters hourly and lineups after every tip-off. Both
now share `roundWindows`, so the 2026-27 round 3 on the ten-minute worker
clock is read at 16:10 and 17:10 on its two game days and at 21:30 once
settled (`windows.test.ts`, "one read per game day across a real round").

## Why the roles freeze on the existing row

A row per game day would have changed the unique index every reader and both
writers key on, and the four raw `basketnews_result` readers that count one
row per member per round. A `roles` field on the same row keeps the index,
keeps a write atomic, and lets `lineupWeights` — the single seam every scoring
reader already goes through — read the frozen role first. Carry-forward copies
`slots`, never `roles`: a carried lineup's roles froze in another round.

`freezeRoles` is pure: it is handed each player's game day (his club's fixture
in the round) and the latest game day the read has reached (`readDayAt`, five
minutes past that day's first tip-off). A Sync now pressed on a game-day
morning reaches only the days before, so it freezes nobody who has not
played.

Two captains can be frozen: day 1's, then the player the armband moved to.
Each is weighed ×2 for his own game. That follows the rule "scored in the role
he held when he played"; whether either official game allows, or doubles, a
second captain in one round was not checked. The AI sheet's captaincy and the
Stats page's captain regret name the first of them (`effectiveCaptain`).

## Failure recovery

Each read is one `writeLineup` upsert per member, `slots` and `roles` in the
same row. A pass that dies part-way leaves some members frozen and some not;
the next due read freezes only those still missing. BasketNews reads its
stored roles before weighing (`frozenRoles`), and writes the same roles it
weighed by, so the stored result and the stored roles cannot disagree.

## Tests

- `lineup.test.ts`: the day's early and late games freeze together; a frozen
  role never moves; a missed day catches up; Montero's day 1 armband counts
  ×2 after he is benched; frozen roles are not carried forward.
- `windows.test.ts`: game days for two- and three-day rounds, once per game
  day, nothing between the freeze closing and the round settling, the settled
  read, six-hour previews only between rounds.
- `lineup-sync.test.ts`: two Fantasy Challenge reads a day apart with the
  armband moved between them; a Sync now before the first tip-off freezes
  nobody.
- `sync.test.ts`: the Tinginiai case rebuilt — a day 1 starter benched for a
  day 2 player adds up to the official score with no warning. Weighing by the
  card instead brings the warning back. The worker's queue reads on a game
  day's first tip-off and not again that day.
- `round-facts.test.ts`: a player who played as captain is called captain
  after the armband moved.

## After the deploy

To check on the VPS, read-only: during round 7 (21–23 October), three
BasketNews jobs and three Fantasy Challenge lineup runs, plus one each after
the round settles; every member's `roles` filled; no "adds up to" warning on
the BasketNews jobs; the EuroVafliai lineup report's "N round totals differ"
falling toward zero.
