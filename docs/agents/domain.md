# Domain Docs

How the engineering skills should consume this repo's domain documentation when
exploring the codebase. Layout: **single-context**.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the ubiquitous language. It also lists the
  words this project deliberately does *not* use.
- **`docs/adr/`** — architecture decision records, indexed in
  `docs/adr/README.md`. Files are named `ADR-<nnnn>-<slug>.md`.
- **`docs/EUROVAFLIAI_BLUEPRINT.md`** — the master plan and the locked decision
  log (§2). Product decisions live there, not in ADRs; treat §2 as settled.
- **`PRODUCT.md`** — users, purpose, principles, and the facts future work must
  not fabricate.

## File structure

```
/
├── CONTEXT.md
├── PRODUCT.md
├── docs/
│   ├── EUROVAFLIAI_BLUEPRINT.md
│   ├── adr/
│   │   ├── README.md
│   │   ├── ADR-0001-stack.md
│   │   ├── ADR-0002-realtime-and-worker.md
│   │   └── ADR-0003-no-transactions.md
│   └── agents/
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (an issue title, a test name, a
variable, a UI label), use the term as defined in `CONTEXT.md`. Do not drift to
the synonyms it explicitly rejects: it is *commissioner* not admin, *club* not
team for real Euroleague sides, and "round" always gets qualified as a draft
round or a Euroleague round.

If the concept you need isn't in the glossary, that's a signal — either you're
inventing language the project doesn't use (reconsider) or there's a real gap
(add it in the PR that introduces the concept).

## Flag ADR conflicts

If your output contradicts an ADR, surface it rather than silently overriding:

> _Contradicts ADR-0003 (no transactions) — but worth reopening because…_

The three current ADRs are load-bearing for correctness, not stylistic: server
authority, engine purity, and the pick-race defense. Contradicting one is a
design change that needs its own record, not an implementation detail.
