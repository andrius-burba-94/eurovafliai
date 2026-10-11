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
  captain's bonus. With no average he is not a candidate.
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
- **Standing does not repeat the rank.** The hero prints it, and a figure in
  the sheet is a figure the model will use.

**The gap below** is `neighboursOf` in `src/lib/season/story.ts`, beside
`movementOf` and ranked by the same rule (total, then team name), so the
brief and the table cannot disagree about who is above whom.

**Checked on real data.** `ai:preview --briefs --facts-only` ran against a
copy of the local database served on another port, after `stats:sync` had
brought its fixtures up to round 4. It printed a 1,632-character sheet for
three members, and none of the league's 344 team, member and player names
appeared in it. `fake-pb`'s `getOne` now projects `fields`, as its lists
already did, because the Scout's `readBoard` asks for them.
