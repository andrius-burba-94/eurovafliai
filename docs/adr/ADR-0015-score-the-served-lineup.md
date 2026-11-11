# ADR-0015: A round scores the lineup the official game serves

Date: 2026-11-11
Status: accepted. Supersedes the frozen roles of [ADR-0014](ADR-0014-frozen-roles.md); its one read per game day stands.

## Context

ADR-0014 assumed that neither official game serves a lineup as it was on an
earlier game day, so it froze each player's role at the first read on his
game day and scored that role over the lineup. Frozen roles shipped before
round 7 of 2026–27.

Checked on 11 November 2026 against both games, read-only, for the live
leagues:

- **Fantasy Challenge** (EuroVafliai 26-27, 8 teams, rounds 1–10): the
  stored lineups, scored as served (captain ×2, starters and sixth man ×1,
  bench ×0.5, inactive ×0), equal the official round table
  (`/tournaments/214586/standings`) in **80 of 80** team-rounds. With frozen
  roles laid over them they were over by 1–47 points in most team-rounds from
  round 7 on, and the table had the wrong order (Monikutės Naktys 4th, not
  2nd).
- **BasketNews** (Hostinger CA$HiorAI, rounds 6–10): the stored lineups
  reproduce the official round score in 44 of 45 team-rounds; with frozen
  roles, 27 of 45. Its table was right only because it keeps BasketNews's own
  score.

Two faults stacked. The read runs five minutes after a game day's first
tip-off, so a change a manager made later that day, for a later game, froze
the wrong role. And every player who ever froze as captain counted ×2, so a
moved armband made two or three captains in one round.

## Decision

- **Score the lineup the official game serves.** `round_lineups.slots` is the
  only role a player has; nothing is laid over it. The read that settles a
  round (last tip-off + 3 h) writes the lineup its standings keep.
- **Frozen roles are removed**: `freezeRoles`, `effectiveRoles`,
  `effectiveCaptain`, `readFrozenRoles`, `roundFreeze`, `readDayAt`, and the
  `round_lineups.roles` field (migration `1791500000`).
- **The schedule from ADR-0014 stays**: one read per game day, one when the
  round settles, one every six hours between rounds, both games on the same
  clock. The game-day reads now only keep Matchday's lineups current.
- A BasketNews lineup is weighed by its own cards, and its official score
  still rules its table.

## Consequences

- EuroVafliai 26-27's standings rebuild from the stored lineups on the next
  recompute after the deploy and match the official order. Small gaps of up
  to about 2.5 points a season remain, from box-score corrections the
  official game applied and the feed did not.
- The Montero case that motivated ADR-0014 (round 3) does not reproduce:
  round 3's stored lineups now equal the official total for every team. Why
  it differed on 16 October was not established; Tinginiai (BasketNews round
  5) was not rechecked.
- If an official game ever starts serving a lineup that does not add up to its
  own total, the "adds up to" warning (BasketNews) and the "round totals
  differ" report (Fantasy Challenge) are where it will show first.
