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

The 26 October review also covered a leave-and-return sequence whose final
roster is unchanged. The sync reads its transfer log and journals the source
event legs alongside the target, so a previously verified target cannot hide
new history. Repeated reads record each leg once and create no scoring windows
for that round trip.

The final unit run passed 154 files / 2,174 tests. Lint and typecheck passed;
lint retains existing warnings in local, untracked skill files. The normal
dead-code command reports ten of those unrelated skill files; checking the
application with those local-only directories excluded passes. The new
migration and API rule/index checks passed against a fresh disposable
PocketBase. Six focused Playwright checks passed in installed Google Chrome
(three desktop, three at 375px) against that final schema on 26 October.
The queue assertion now waits for the asynchronous server action to finish
instead of racing its already-saved approval intent. Webpack production compilation and prerendering
completed, but the final build command exited on Next's existing security
advisory; the default Turbopack build also encountered local sandbox limits.
CI must verify the production build before merging.

The personal owning Hostinger account was verified in Chrome. Production was
clean at the game-day sync release; the web app, worker, PocketBase and backup
timer were healthy. A pre-rollout backup completed successfully at
10:05 UTC: `eurovafliai-20261023100501.zip`, retaining 14 archives.

Production rollout results must be recorded before claiming this is live.
PR #211 was created through the personal GitHub session on 23 October. On
26 October, Chrome's control connection was unavailable. Automatic approval
review refused reconnection from the foreground Gmail inbox because private
email is outside this task. The user was asked to switch to the personal
GitHub tab and reconnect there; Chrome was available again later that day.
The initial PR passed all eight CI checks before the additional
leave-and-return correction. Take a new production backup
before the resumed rollout; the 23 October backup is no longer fresh.
Koloko remains unapproved until the commissioner acts or an
official roster read confirms him. Old frozen roles cannot be reconstructed;
the stored official totals continue to rule.

## 26 October rollout preflight

The final revision passed all eight PR checks, including the complete browser
shards. Two runners were retried after stalling on an Ubuntu font download;
the fresh runners completed successfully. PR #211 was squash-merged as
`5f36f38`; production waits for the green-main deployment pipeline.

A new PocketBase backup completed successfully:
`eurovafliai-20261026100323.zip` (14 archives retained). The production checkout
was clean before rollout. A read-only comparison of all nine round-8 public
BasketNews rosters found six matching and three behind, with 13 stored players
per team. Saved lineups and official totals were complete for all nine teams
through round 6; round 7 had nine non-final saved lineups.

The official E2026 roster read returned 336 players, zero parsing problems,
and no Christian Koloko. No approval was granted during preflight.

## Main CI rollout gate

The final PR passed all eight checks, but main CI then failed the unchanged
theme reload test twice, including a failed-job retry. The local full shard
reproduced the same 30-second timeout. Repeated traced runs identified the
cause: `isVisible()` inspected the sidebar before the streamed shell arrived,
returned false on desktop, and selected the hidden phone menu. The test now
waits for the shell and labels each phase. Its original assertions and
30-second timeout remain intact; no deployment check is bypassed.

A refreshed production backup completed at 11:15 UTC on 26 October:
`eurovafliai-20261026111500.zip` (14 archives retained). Production is still
on its previous release while the main CI gate is resolved.
