---
target: Your round panel on Recap and the commissioner brief count
total_score: 19
max_score: 32
na_heuristics: 3,5
p0_count: 0
p1_count: 2
timestamp: 2026-10-11T17-35-39Z
slug: src-app-l-league-recap-writeup-tsx
---
Method: dual-agent (A: design review · B: detector and browser evidence), on a seeded local league at 390px and 1280px, dark and light. Mode: Read (the morning after).

#### Design health score

| # | Heuristic | Score | Key issue |
|---|-----------|-------|-----------|
| 1 | Visibility of system status | 2 | A missing brief sat in the commissioner's folded strip, behind a green dot (fixed: the strip now opens when the count is short) |
| 2 | Match with the real world | 2 | "Won" means the top third of the night, right under a "Round winner" banner crowning one team |
| 3 | User control and freedom | n/a | A read-only panel |
| 4 | Consistency and standards | 3 | The badge and label system match the board; "Briefs" in the strip, "Your round" on the panel |
| 5 | Error prevention | n/a | Nothing to enter |
| 6 | Recognition rather than recall | 4 | Labelled rows; names are links |
| 7 | Flexibility and efficiency | 2 | About 400px on a phone before the write-up, with no way to fold it |
| 8 | Aesthetic and minimalist design | 2 | "Round 4" five times on the page; the Night line repeats the badge |
| 9 | Error recovery | 1 | A member whose brief failed sees nothing; the commissioner had no reason or retry note (the note is fixed) |
| 10 | Help and documentation | 3 | The strip explains the guard; nothing on the page says members get a brief |
| **Total** | | **19/32** | Two heuristics n/a |

#### Is the design specific to Eurovafliai?

Yes, mostly. Night / Table / Next, the thirds verdict, `slot-label` terms and the framed Bank are the board's own vocabulary. The sameness is in composition: a framed card with an outlined pill in the corner is exactly Best night, Wooden spoon and The night. The one panel about *you* has nothing in its shape that says so.

Deterministic scan:
- `detect.mjs` found nothing on `YourRound` or the strip.
- Two advisories are off the type ramp (`text-[0.6875rem]` on `StatusBadge`, `text-[0.9375rem]` on `WriteupNote`). Both sizes are used across the app, so they are false positives in practice.
- In the page (CSP bypassed), the only hits were the masthead wordmark's deliberate clip, uppercase labels and Space Grotesk's share of the page.
- The page does not scroll sideways at 390px.
- Contrast:
  - Badge text is 5.5–17.4:1 in both themes.
  - The panel's terms are 9.6:1 and its lines 15.5–17.4:1.
  - The count line is 9.6–9.8:1.
  - The Won outline in light mode is 2.6:1, but the word is printed, so colour is not the only signal.
- The `dl` is exposed as a description list, with Night, Table and Next as terms.
- Links are inline in prose: 21px per line box, 47px when they wrap.

#### What works

- **Semantics:** a real `dl` in a two-column grid. A 40-character team name and long player names wrap without overflow.
- **The verdict always prints its word**, and Held is neutral rather than greyed out.
- **The order:** yours, then everyone's write-up, then the ladder. It reads like the morning after.

#### Priority issues

- **[P1] "Won" collides with "Round winner".** In a nine-team league, 2nd and 3rd read "Won · Round 4" under a banner crowning someone else.
  - Fix: scope the word ("Won the night", "Top third"), or print the place beside it ("Won · 2nd of 9"). This is the #203 decision, so it is yours to make.
  - Command: /impeccable clarify
- **[P1] The commissioner could not see a missing brief.** Fixed in this PR: the strip opens when the count is short and says Rewrite covers the briefs. It still cannot say why a brief is missing; the commissioner never reads the row.
- **[P2] The Night line repeats the badge.** "You won the night in 1st" restates the badge, the banner and the ladder.
  - Fix: let the deterministic badge carry the place and have the prompt open on the decider.
  - Command: /impeccable distill
- **[P2] Scroll cost on a phone.** The brief (about 400px) and the write-up (about 370px) push The night below two screens.
  - Fix: tighter phone spacing, or fold Table and Next. Check against the #203 decision first.
  - Command: /impeccable layout
- **[P3] "Round 4" in the corner is redundant on Recap.** The eyebrow, picker, headline and The night all say it.

#### Persona red flags

- **Member on a phone, 2nd of 9:** sees "WON" beside someone else's crown, then scrolls past two prose panels to reach the ladder.
- **Commissioner:** "Rewrite this round" did not say it covers briefs (fixed).
- **Screen-reader user:** heard "Won Round 4" with no separator. Fixed: it now reads "Your night: Won. Round 4". Four or more links in three sentences is dense.

#### Minor observations

- The fixture showed both "6.17" and "21.7". Each line copies its figures from the sheet, which writes table gaps in hundredths, so this is true to the sheet but uneven to read.
- Nothing on the page tells a member, who has no brief, that briefs exist. That is correct for privacy and invisible for discovery.

#### Questions

- If the verdict is deterministic, why is it the smallest type in the panel, while the model's "You won the night" is body size?
- Should the round winner's panel lead with Next, the only line that is new to them?
