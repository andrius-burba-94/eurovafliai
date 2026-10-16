# ADR-0014: One read per game day, and a player scores in the role he played in

Date: 2026-10-16
Status: accepted

## Context

A Euroleague round is two or three game days (2026–27: round 5 Tue/Wed,
round 7 Wed/Thu/Fri). Fantasy Challenge locks a player when his own game tips
off and scores him in the slot he held then, but lets a manager keep moving
everybody else, and the captaincy, until the round's last game. BasketNews
behaves the same way as far as its round 5 scores show. Neither API serves
the lineup as it was on an earlier game day: each serves it as it is now.

The app kept one lineup per team per round and every sync read overwrote it,
so the stored lineup was the one after the round's last read. Day 1's captain
benched for day 2 was scored at ×0.5 instead of ×2: Montero, round 3, 50 here
against 62 official. In BasketNews the same change made Tinginiai's round 5
lineup add up to 127.25 against an official 141, and the sync refused every
pass for two days (#208).

The two syncs were also on different clocks: Fantasy Challenge hourly in a
round plus a read after every tip-off, BasketNews a job every fifteen minutes
around the clock.

## Decision

- **A frozen role per player, on the existing row.** `round_lineups.roles`
  holds `{ playerId: { role, day, at } }`. A sync read freezes every player in
  the lineup whose game day it has reached and who has no role yet; a frozen
  role never moves. `slots` stays the lineup as it is now. The unique index
  `(league, member, season, round)` is unchanged, so every reader keyed by
  round keeps working and a write still lands whole.
- **Scoring reads the frozen role first**, through `lineupWeights` — the one
  seam the table, Matchday, Recap, Stats and the AI sheets share — so no two
  surfaces disagree. BasketNews weighs its own points the same way, and the
  official score still rules its table.
- **One read per game day.** Five minutes after each game day's first
  tip-off, once more when the round has settled (last tip-off + 3 h), and
  every six hours between rounds. Both providers use the same windows
  (`roundWindows().days`, `lineupRoundsDue`, `basketNewsDue`). Sync now is
  unchanged, and a Sync now before a day's first tip-off freezes nobody.
- **Only a sync freezes.** A lineup typed in the app never writes `roles`.

## Consequences

- A change made after the day's read, for a game later that same day, is
  missed: the day's late games freeze with its early ones. Chosen over a read
  after every tip-off (three to five a game day) to keep reads few; recorded
  as debt.
- A game day whose read was missed (worker down) freezes at the next read,
  which is what happened to every game day before this.
- Rounds before the deploy keep their totals: there were no per-day reads to
  freeze from.
- The courts on Lineup and Matchday still draw `slots`; showing frozen roles
  there is a follow-up.
