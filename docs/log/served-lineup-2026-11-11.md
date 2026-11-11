# Standings score the served lineup, 11 November 2026

The report: EuroVafliai 26-27 showed Monikutės Naktys 4th, while the official
Fantasy Challenge table had them 2nd. Hostinger CA$HiorAI looked right.

## What the worker showed

Both syncs were running on schedule, and every run was `applied`. The
Fantasy Challenge lineup report gave the first clue. On a game-day read it
said "Every round total matches the official one". On the read after the round
settled it said "8 round totals differ" in every round from 8 to 10. Some of
those gaps were the official game scoring late: at 22:51 on 6 November it still
had Kalaškračiai on 21.3. The rest were ours.

## The comparison

Everything below was read-only, with the worker's own superuser and token:

- `standings_snapshots` against `/tournaments/214586/standings?matchday=…`,
  round by round. Rounds 1–6 matched within 2.2 points (stat corrections). From
  round 7 almost every team-round was off, nearly always over, by up to
  46.8 points.
- Each stored `round_lineups.slots`, scored with the official per-player
  `pts`, against the official lineup total. It matched in 80 of 80
  team-rounds. With `roles` laid over the slots, the lineup carried two or
  three ×2 captains in many rounds. Laurynas Birutis, round 7: 164.25
  against 117.3 official, with Bryant (frozen on day 1), Punter (day 2) and
  Edwards (day 3) all counted as captain.
- BasketNews, rounds 6–10: `slots` with the stored raw points reproduce
  `totalHundredths` in 44 of 45 rows; with `calculatedHundredths` (frozen
  roles), 27 of 45. The one miss is Sofa Kings, round 9.
- The table rebuilt from our own box scores without frozen roles comes out in
  the official order: FBK KISIEL 1372.05, Monikutės Naktys 1326.40,
  Laurynas Birutis 1323.80, and so on. Every team is within 2.5 points of its
  official total.

## Why it went wrong

The freeze ran five minutes after a game day's first tip-off and froze every
player playing that day, so a captain moved to an evening game froze in his
morning role. A frozen role never moved, and `multipliersOf` gave ×2 to every
player who froze as captain, whatever `effectiveCaptain` called the round's
captain. The BasketNews table was not affected because its standings keep
BasketNews's own score. The Fantasy Challenge table is computed from our box
scores, so it took the error in full.

## What changed

Frozen roles are removed from both syncs, from scoring and from the schema.
The game-day schedule stays. See ADR-0015.
