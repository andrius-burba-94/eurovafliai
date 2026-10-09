---
name: ai-commentary
description: Rules for Eurovafliai's AI write-ups (Phase 7, ADR-0012) — the worker computes a fact sheet and the model only narrates it; teams and players reach the model as @T/#P tokens, never names; every write-up passes the guard; write-ups are stored once in ai_writeups and never generated on page load; one Gemini client, stateless, model from GEMINI_MODEL. Use when touching src/lib/ai/, ai_writeups, a fact sheet, a prompt or voice, the Gemini client, ai:preview, or adding any AI-written surface (round report, scout, brief, rankings, trade desk, lineup coach).
paths:
  - "src/lib/ai/**"
  - "scripts/ai-preview.mts"
  - "pb/pb_migrations/*ai_writeups*"
---

# AI commentary

The rule above all others is the product's: **nothing latency- or
fairness-critical depends on an LLM.** Autodraft, legality, scoring and
standings never read a write-up. Everything below follows from taking that
seriously while still letting a model write.

## The shape of every AI feature

1. **A fact sheet, built and tested first.** Pure code in `src/lib/ai/`
   computes every number, rank and judgement the prose may use. A judgement
   ("overperformer", "captain flop", "moves worth making") is a label with a
   named threshold constant and a boundary test. If the prose needs a figure,
   the sheet prints it — the model never adds, subtracts, averages or ranks.
2. **Tokens, not names.** `assignTokens` numbers teams `@T…` and players
   `#P…` in sorted-id order (the hash depends on it). Clubs go as their public
   codes. Never serialize a league, team or user name, `transactions.note`,
   `player_news.headline`/`url`, or any record id. The sheet's privacy test
   seeds real-looking names and asserts none appear.
3. **The guard decides.** `checkWriteup` with the sheet's own numbers
   (`numbersIn(text)`), tokens and private names. One retry with the
   violations fed back (`writeRoundSummary` is the pattern); a second refusal
   stores `failed` and shows nothing.
4. **Stored once.** `claimWriteup` → model call → `completeWriteup` /
   `failWriteup`. `input_hash` covers facts, voice, prompt version and model;
   unchanged input is never rewritten. Private advice uses `member`; a
   league-wide row writes `member: ""` explicitly.
5. **Rendered at read time.** Pages read `ai_writeups` with the viewer's token
   and turn tokens back into names with `renderSegments` — never markdown or
   HTML from the model.

## Known gotchas

- **Nothing from after the round.** `players.proj_*` and `players.status` are
  *now*; a past round's sheet builds averages from earlier rounds' lines and
  only the next-round section may show today's status, saying so.
- **Units.** Team figures are snapshot hundredths; player figures are
  hundredths in both rulesets. BasketNews `fantasy_pts` from
  `readLeaguePlayerRounds` are *fractional tenths* — `formatTenths` prints
  them malformed. Use `formatHundredths`.
- **A did-not-play is never an underperformer.** Separate DNP (no minutes
  while his club played) from a bad night.
- **Deals are grouped.** Use `groupTransactionHistory` (rows newest first) so
  a synced drop + add is one exchange; never pair released and signed players
  the source did not pair.
- **Refuse unfinished rounds.** `roundProgress().complete`, and for
  BasketNews every member's `basketnews_result.final === true`.
- **A schema is not a guarantee.** The model has opened a JSON answer with a
  sentence and a code fence; `readAnswer` takes the outermost object and
  trusts only `status: "completed"`.
- **`store: false`** on every Interactions call; no temperature for Gemini 3;
  the key in the `x-goog-api-key` header only, scrubbed from every message.
- **No `maxLength` in Gemini's schema subset** — enforce lengths in zod.
- **Ask for exactly the sheet's sections.** Offered every key, the lite
  model wrote `under` for an OVERPERFORMER line. `summarySchema(sectionsIn(sheet))`
  names only the sections the sheet has, all required (7.1).
- **A changed hash is not a reason to rewrite.** The latest round's sheet
  carries today's injury flags, and the hash covers model and prompt. Re-guard
  the stored prose against a fresh sheet; rewrite only when it fails (ADR-0013).
- **No lineup means no role.** A rule that needs a starting role must treat a
  team that records no lineup as everyone in full, or it never fires there
  (underperformers did not, until 7.1).
- **Framework-free.** Worker-run AI modules are walked by
  `src/worker/framework-free.test.ts`; add new ones to its `PENDING` list
  until the worker imports them.

## Testing and trying

- Unit: the sheet against a hand-built league (every label earned once), the
  guard rule by rule, the client against captured fixtures in
  `src/lib/ai/fixtures/`. `npm run test` never calls Gemini.
- Live: `npm run ai:preview -- --league=<slug> [--facts-only] [--voice=pundit]
  [--model=…] [--save]`. Locally use `GEMINI_MODEL=gemini-3.5-flash-lite`;
  free-tier limits are per model. Facts and API shapes:
  `docs/research/gemini-api.md`.
