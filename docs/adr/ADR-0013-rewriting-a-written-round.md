# ADR-0013: When a written round is rewritten

Date: 2026-10-09
Status: accepted; settles the question ADR-0012 left to slice 7.1

## Context

ADR-0012 stores a write-up once, keyed by an input hash over the facts, the
voice, the prompt version and the model, and leaves open when a stat
correction may rewrite prose people have already read. Regenerating whenever
that hash changes does not work, for two reasons found in 7.0's code:

- A round's fact sheet is not stable over time. Its next-round section
  carries *today's* injury flags (`round-facts.ts`), so rebuilding round 3's
  sheet a week later hashes differently with every round-3 number unchanged.
- The hash covers the model and the prompt, so changing `GEMINI_MODEL` or a
  word of the prompt would rewrite every round of the season.

Corrections themselves are rare and arrive two ways: a Euroleague box score
amended by hand through `/stats/import` (the ingest never re-reads a stored
game), and a BasketNews round re-read until its source calls it final.

## Decision

- **Written once, when the round is final.** The worker writes a round the
  first time `readRoundFacts` accepts it, and never again on its own unless
  the prose has become false.
- **Re-guard, rewrite only if false.** Once a day per league, and right after
  a `/stats/import` batch is applied, the worker rebuilds each written
  round's sheet and runs the guard on the *stored* lines against it. If every
  cited number and token is still in the sheet, the write-up stands, even
  though its hash no longer matches. If not, it is rewritten, in the league's
  current voice.
- **Model, prompt and voice changes never rewrite history.** They apply to
  rounds written from then on.
- **The commissioner can force it.** *Rewrite this round* on Recap queues a
  forced rewrite (no cap); the worker picks queued rows up within a minute.
  No request calls the model.
- **No chat post.** Write-ups live on Recap with a headline teaser on League
  Home; the chat stays the members' (a deviation from blueprint 7.1, recorded
  in STATUS.md).

## Consequences

People can rely on what they read: prose changes only when it was wrong or
when the commissioner asks. The cost is that a stored write-up's hash is no
longer a freshness signal on its own; the guard is. The guard checks that a
number is *in* the sheet, not that it is attributed to the right line, so a
correction that moves a figure onto another player can leave a sentence that
passes and is wrong; the commissioner's Rewrite is the answer to that, and
the attribution check (a warning since 7.0) may become a refusal once preview
runs show how often fair prose trips it.

## Alternatives

- **Rewrite on any hash change.** Needs the time-dependent section moved out
  of the hash, and still rewrites the season on a model or prompt bump.
- **Freeze; commissioner only.** Simplest, but a correction leaves wrong
  numbers in front of friends until somebody notices.
