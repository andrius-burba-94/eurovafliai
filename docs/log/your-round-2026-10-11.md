# 7.3 Your round, October 2026

Spec #200. Slices land as tickets; each appends its section here.

## 7.3 A The brief's fact sheet (#201)

`buildBriefFacts` (`src/lib/ai/brief-facts.ts`, pure) returns a shared
header and one section per member. The header carries the scoring and the
table in tokens, which the whole league can already see. A section carries
everything that member's three lines may say. A brief will be guarded
against the header and its own section only, so a member's move worth
making, which is in no other section, cannot reach anyone else's brief.

**One set of measurements.** The round sheet worked out every player's
night, the captaincies, the deals' swings and the next round's run inside
one 500-line function. The brief needs all of them, and a brief that
disagreed with the round write-up about a night would be worse than no
brief. So they moved, unchanged, into `analyseRound`
(`src/lib/ai/round-analysis.ts`), which both sheets read. The round sheet's
text, refs and number sets were snapshotted for six variants before the move
and matched after it.

**Decisions the spec left open, and how they went:**
- **The top counted scorer is valued above his own average** (counted minus
  his average times his role), not at his counted night. Valued at his night,
  he would win every ranking: a captain's counted night is always double the
  captain's bonus. With no average he is not a candidate. A recorded
  captain is never the top scorer: his night is the captain decider's, and
  the review caught one night filling both printed slots ("captain bonus
  +40.0", "top counted scorer +30.0").
- **The underperformer is valued the same way**, so a captain's slump costs
  double, as it did on the night. The line still prints his raw night against
  his average, as the round sheet does.
- **"Bench half lost" is the one bench player whose half cost most**, not
  the bench's total, so the line can name him.
- **"Short-handed" is one candidate** covering every owned player with no
  game (his club sat out) or who did not play. It is valued at what their
  averages would have counted in their roles, so an inactive player costs
  nothing and a player with no average is left out.
- **The flagged player is the one with the bigger average**, then injured
  before doubtful.
- **A top-three streak is an honour only from three straight nights**, the
  "on fire" badge's own threshold (`ON_FIRE_STREAK`), and **only in a league
  of more than three teams**. Real data showed why: in a three-team league
  every team is always top three, and every section read "top-three streak
  now 4".
- **Standing does not repeat the rank.** The hero prints it. The header's
  table and the trend line still carry ranks, as the spec asks, so keeping
  the second line off the rank is the prompt's job in 7.3 B, not the
  sheet's.
- **The trend compares with the snapshot three back** (`TREND_ROUNDS`) and
  prints which round that was, so a league whose snapshots skip a round is
  told the round it is actually compared with.

**The gap below** is `neighboursOf` in `src/lib/season/story.ts`, beside
`movementOf` and ranked by the same rule (total, then team name), so the
brief and the table cannot disagree about who is above whom.

**Checked on real data.** `ai:preview --briefs --facts-only` ran against a
copy of the local database served on another port, after `stats:sync` had
brought its fixtures up to round 4. It printed a 1,632-character sheet for
three members, and none of the league's 344 team, member and player names
appeared in it. `fake-pb`'s `getOne` now projects `fields`, as its lists
already did, because the Scout's `readBoard` asks for them.

## 7.3 B Briefs written and stored (#202)

A brief is an `ai_writeups` row of kind `round_brief` with `member` set
(migration `1791200000_round_briefs.js`; the down migration deletes those
rows first). The existing rule and unique index already make it one private
row per member per round, the commissioner included, and `pb:verify` now
checks that the commissioner cannot open a member's brief.

**The writer** (`writeBriefs`, `src/lib/ai/briefs.ts`) follows the scout's
reasons: one call per league, the answer keyed by team token, one retry
that asks only for the refused members with their faults listed. Each
member's three lines are guarded against the shared header and that
member's own section, and the row's `refs` are only the tokens those two
issue (`briefRefs`). That is the privacy test: a brief that cites another
member's move fails on its token and its gain, and stored refs never carry
another member's players.

**Decisions the spec left open:**
- **Each line is exactly one sentence of 20 to 200 characters**, checked in
  zod like the scout's two-sentence reasons. Gemini's schema subset has no
  `maxLength`.
- **Keeping `standing` off the rank is the prompt's job**, as 7.3 A left it,
  because the hero prints the rank and the movement. The guard cannot tell a
  rank from a gap, so this is not enforced. On real data the first wording
  ("never give the team's place") still got "you fell from 1st after round 1
  to 3rd now", copied off the TREND line. Asking for the trend's word alone
  and naming "1st, 2nd, 3rd" as forbidden fixed it (`round-brief-2`).
- **The pass reads `league_members` before the sheet.** The sheet reads the
  whole season's box scores, and a league whose briefs are all written needs
  none of it. That keeps the fifteen-minute pass cheap once a round's briefs
  are stored.
- **Due means no row or a failed row**; a `pending` row is left to the
  claim, which waits out a fresh one and takes over a stale one. A ready
  brief is not looked at again until 7.3 E's re-guard.
- **The order is round write-up, briefs, scout.** `runWriteupPass` counts the
  round pass's model calls at the `write` it hands in, so a round pass that
  throws partway still leaves an honest budget. A fault in one job no longer
  costs the others their turn: the round pass's error is thrown once briefs
  and reasons have run, so the worker logs it and re-authenticates as
  before.

The first version of the reordered pass never ran the scout: `onScout?.(await
runScoutPass(…))` skips its argument entirely when no `onScout` is passed.
The test that passes none caught it.

**Checked.** The migration went up, down and up again on a copy of the local
database; with a `round_brief` row present, down deleted it and narrowed the
kinds back. `pb:verify` passed against that copy. `ai:preview --briefs`
against the same copy (three teams, round 4, `gemini-3.5-flash-lite`) wrote
all three briefs in one call in the analyst voice and again in the pundit
voice; one run of three needed the retry, and every brief passed the guard.
