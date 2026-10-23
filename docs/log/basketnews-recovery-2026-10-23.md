# BasketNews roster and trade recovery, 23 October 2026

## Verified production failure

The Hostinger CA$HiorAI sync page showed repeated blocked jobs from 21 October,
asking for Christian Koloko with no candidate in the local pool. A public
BasketNews pool read listed him (`6ad4b3ef16f8030eda89f4c9`, center, Crvena
Zvezda); the official EuroLeague RED club roster did not. BasketNews's round
index 6 transfer log contained Einikio Kabliai's Reuvers → Koloko move,
processed on 21 October at 13:03 UTC for round 7.

The earlier Cameron Payne repair assumed the official roster would eventually
supply every source player. It cannot resolve the interval before registration.
The score-mismatch repair also left historical reads ahead of the public roster,
and the roster import returned early on an unchanged feed, skipping failed
follow-ups just when the next pass needed to finish them.

## Decisions

- Keep ADR-0014's game-day reads and six-hour previews.
- BasketNews alone does not authorize an automatic player create. A manager
  can approve its fresh public listing; otherwise the official roster poll
  confirms a unique full-name-and-club match after the authoritative import.
- An approved player has one canonical ID, no invented EuroLeague code, and
  `awaiting_registration`. The ordinary roster import fills that same row's
  code; confirmation removes its temporary departure protection. Manual
  locks, CSV authority and ambiguous-rename quarantine remain in force.
- A durable question survives later job failures and records last check and
  outstanding recovery leagues. Queueing a running job is not success: an
  applied job acknowledges recovery. An interrupted approval create is
  resumed using a fresh BasketNews read.
- Public roster reconciliation precedes historical writes. Scores and
  private lineups can fail independently. Public reads never erase stored
  official scores. Roster ownership has its own monotonic round checkpoint.
- Transfer logs preserve event boundaries and unequal sides. A pass-through
  player remains in the transaction history without a fictitious scoring
  window. An inconsistent accepted log falls back to verified snapshots and
  explicitly asks for exact-history reconciliation; accepted status alone is
  insufficient evidence of a coherent sequence.

## Failure recovery

Migration `1791400000_basketnews_recovery.js` adds source questions, roster
journals, the ownership checkpoint, temporary registration protection and
source-event transaction provenance. Questions are server-only; the page and
actions enforce the affected league's manager gate. Roster journals use the
same league-scoped member read rules as sync runs.

A roster batch stores its complete steps, target and timestamp before any
membership write. A retry resumes the exact steps, using transaction intent
and the active-membership unique index. It verifies ownership, advances the
checkpoint and only then marks the journal applied. Restart recovery happens
before any provider read. A partial lineup is repaired separately from its
first incomplete round, including gaps below newer stored lineups.

Roster follow-ups inspect outstanding evidence on unchanged imports too:
known codes with missing game lines, unattached news, source registrations
and blocked external syncs. Recovery questions retain their pending leagues
until an applied job acknowledges them.

`npm run basketnews:repair -- --league=<id> --rounds=4,5,6,7` defaults to a dry
run. It reconstructs pre-round ownership from membership windows, requires
complete saved round lineups, and verifies the official log's final ownership.
`--write` creates or identifies source-event legs before removing stale
BasketNews snapshot rows. It leaves manual transactions and roster windows
alone, then recomputes standings. Re-running repairs an interrupted history
rewrite. Run it with the worker stopped to avoid concurrent history changes.

## Verification and rollout

The tests cover missing source players, approval with no jersey, duplicate
approval, later official registration preserving IDs, automatic confirmation,
namesakes and locks, failed follow-up queues, interrupted approval creates,
historical private-session failure alongside a current roster update, and
failures at transaction creation, window close/open and journal verdict.
Transfer tests include unequal sides, pass-through players, rejected or
inconsistent logs and idempotent historical repair.

The final unit run passed 154 files / 2,173 tests. Lint and typecheck passed;
lint retains existing warnings in local, untracked skill files. The normal
dead-code command reports ten of those unrelated skill files; checking the
application with those local-only directories excluded passes. The new
migration and API rule/index checks passed against a fresh disposable
PocketBase. Three focused Playwright tests passed in installed Google Chrome
against that final schema. Webpack production compilation and prerendering
completed, but the final build command exited on Next's existing security
advisory; the default Turbopack build also encountered local sandbox limits.
CI must verify the production build before merging.

The personal owning Hostinger account was verified in Chrome. Production was
clean at the game-day sync release; the web app, worker, PocketBase and backup
timer were healthy. A pre-rollout backup completed successfully at
10:05 UTC: `eurovafliai-20261023100501.zip`, retaining 14 archives.

Production rollout results must be recorded before claiming this is live.
Koloko remains unapproved until the commissioner acts or an
official roster read confirms him. Old frozen roles cannot be reconstructed;
the stored official totals continue to rule.
