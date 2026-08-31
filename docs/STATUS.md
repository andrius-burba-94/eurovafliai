# Status

**What is done, what is next.** This file is the single answer to "where is this
project?" — read it before proposing work, and update it in the same PR that
changes what it describes.

It is deliberately *not* the plan. The plan is
[EUROVAFLIAI_BLUEPRINT.md](EUROVAFLIAI_BLUEPRINT.md) and it does not move; this
file records how far through it we are. When the two disagree, the blueprint
defines the target and this file is wrong.

> **Phase 1 — walking skeleton. Live at
> [eurovafliai.labrium.online](https://eurovafliai.labrium.online).**
> Auth, league creation, join-by-code, the design foundation, the live lobby and
> the deploy have all landed. Realtime is verified working *through the
> production proxy* — `PB_CONNECT` arrives in 0.1s, unbuffered.

**Next up:** slice **2.1** — roster ingestion, now that the Euroleague API is
confirmed working for E2026 and the pool can be built from real players. Then
**2.3**, draft setup and order determination.

Two Phase 1 items are still open and both are listed under Open debt: a human
two-device confirmation of the lobby, and nightly `pb_data` backups.

---

## Legend

| State | Meaning |
|---|---|
| **done** | Merged to `main`, and its part of the phase DoD holds |
| **partial** | Merged, but something it was scoped to cover was deferred — the Notes say what |
| **next** | The slice being picked up now |
| **todo** | Not started |

---

## Phase 0 — Repository bootstrap & foundation

**Complete.** DoD held: a fresh clone runs `./scripts/pb-download.sh && npm i &&
npm run dev`, and PRs go green through CI.

| Slice | State | Landed |
|---|---|---|
| 0.1 Repo & runtime — Next 16, TS strict, Tailwind v4, Node 24 pin, branch protection | done | `c5bc635`, #1, #8 |
| 0.2 PocketBase — pinned 0.39.11, checksum-verified download, committed migrations | done | `913944e` |
| 0.3 Testing & CI — Vitest + Playwright, GitHub Actions | done | `f42c427`, #14 |
| 0.4 Skills install — mattpocock-skills, impeccable, 3 project skills | done | `5160cbe` |
| 0.5 Foundation docs — CLAUDE/AGENTS/CONTEXT/PRODUCT/DESIGN, ADR 0001–0003 | done | `f9da3f5`, #5 |
| 0.6 Env plumbing — `.env.example` + validated config module | done | `3d13c4d` |

## Phase 1 — Walking skeleton: auth, league, lobby, deployed

**Deployed.** DoD — *"phone + PC, two Google accounts, live lobby on the
production subdomain"* — is met in every mechanical sense: the site serves over
TLS, and realtime is confirmed working through the production nginx proxy. What
has *not* happened is the human half: two people, two devices, one lobby. Until
somebody does that, Phase 1 is complete-pending-confirmation rather than
complete.

**Production:** `https://eurovafliai.labrium.online`, on the shared Hostinger
box `srv837724` — app on `127.0.0.1:3007`, PocketBase on `127.0.0.1:8095`.
Eight other apps live there; see `docs/runbooks/vps-setup.md` before touching
anything.

| Slice | State | Landed | Notes |
|---|---|---|---|
| 1.1 Schema — `leagues`, `league_members`, Google OAuth2 on `users` | done | #2 | Rules and indexes asserted by `npm run pb:verify` |
| 1.2 Auth — Google sign-in, httpOnly session, route protection | done | #6, #11, #12, #13 | Public sign-up closed; first-time OAuth2 sign-up proven against a local OIDC issuer |
| 1.3a League & lobby — create, join by code, lobby page | done | #10 | Shipped without the realtime list or the commissioner controls; both landed in 1.3b |
| 1.3b Lobby, finished — live list, real names, team names, ready, kick | done | #19 | Closes #15. Realtime SSE with the viewer's token — the first use of the `authToken` pattern, and the shape the draft room will copy |
| 1.4 Design foundation — tokens, app shell, the board's vocabulary | done | #17 | The Draft Board Wall. Contract recorded in `DESIGN.md` |
| 1.5 Deploy — VPS, PM2 + systemd, SSE-safe Nginx, `deploy.sh`, auto-deploy | done | #20 | Live behind Certbot TLS. Node 24 is installed for this app alone via fnm, because the box runs Node 22 for eight other apps and this repo's `engine-strict` makes `npm ci` refuse it. **Realtime verified in production**, not just locally — `PB_CONNECT` through the `/pb/` proxy in 0.1s, unbuffered |

## Phase 2 — Draft engine v1, the TDD phase

**In progress.** DoD — *"a full 13-round mock draft on phone + PC with one member
on autodraft, a mid-draft rollback, and the engine suite covering every format ×
edge case"* — needs the pick pipeline and a draft room before it can be
attempted.

| Slice | State | Landed | Notes |
|---|---|---|---|
| 2.1 Roster ingestion — API + CSV, one normalize→diff→apply pipeline | todo, **unblocked** | — | The Euroleague API is confirmed working for E2026 — 20 clubs, 324 players, positions already exactly G/F/C. **Build both front doors.** Findings, including the three that change the design, are in [research/euroleague-api.md](research/euroleague-api.md) |
| **2.2 Engine library** — `buildPickOrder`, `whoIsOnClock`, `isLegalPick`, `selectAutoPick`, `computeRollback` | done | #22 | Pure, 157 tests. Purity is **enforced** by `purity.test.ts`, not just asserted — it reads the source and fails on a PocketBase import, I/O, an implicit clock, or randomness |
| 2.3 Draft setup & order determination — roll / manual / reverse_standings | todo | — | The engine takes `memberIds` already ordered, so this is the slice that decides that order |
| 2.4 Pick pipeline — `drafts` + `picks` migrations, `makePick`, pause/resume, rollback | todo | — | Where pick-then-advance and the two unique indexes land. The engine already computes the rollback and detects the un-advanced state |
| 2.5 Worker — the ~1s sweep, autodraft, repair, `/api/time` | todo | — | The worker app already exists in `ecosystem.config.js` as a heartbeat; this gives it its loop |
| 2.6 Minimal draft room | todo | — | Correctness before beauty; the flagship UI is Phase 3 |

## Phases 3–8

Not started. One line each; the detail lives in the blueprint.

| Phase | State |
|---|---|
| 3 — Draft-day experience (the flagship UI) | todo |
| 4 — Player stats, projections, standings | todo |
| 5 — Season mode: rosters, trades, impact tracking | todo |
| 6 — Optional formats | todo |
| 7 — AI features (Gemini 2.5 Flash) | todo |
| 8 — Hardening & ops polish | todo |

---

## Open debt

Carried deliberately, each with an issue. Anything here that a slice is about to
touch should be fixed by that slice rather than deferred again.

| # | What | Blocks |
|---|---|---|
| [#16](https://github.com/andrius-burba-94/eurovafliai/issues/16) | `createLeague` and `joinLeague` put finished prose in the query string and render it into a `role="alert"` — attacker-controllable text. The 1.3b lobby actions do **not** do this: they return their errors through `useActionState`, so the fix is a change to two older actions, not a new pattern to invent | Nothing; correctness debt in the leagues slice |
| **Local PocketBase drifts from `main`** | A dev database only applies migrations on boot, so a checkout that has been running across a schema change silently tests the old shape. It cost a confusing run of lobby-spec failures. `npm run dev` after pulling is the whole fix; the symptom is `pb:verify` disagreeing with CI | Nothing; a time sink |
| **Two-device confirmation** | Realtime is proven at the protocol level in production, but nobody has yet had two people on two devices in one lobby. That is the literal wording of Phase 1's DoD | Declaring Phase 1 finished |
| **Backups** | No nightly `pb_data` backup yet. Must use PocketBase's backup API, never a naive `cp` of a live SQLite file, and needs one restore drill — an untested backup is not a backup. Belongs before draft night, not before the first deploy | Nothing yet; a draft-night risk |

Closed since the last update:

- **#15** (the lobby's "Unknown member"), fixed in 1.3b by
  `1788181100_users_read_co_members.js`.
- **The Google redirect URI.** `https://eurovafliai.labrium.online/auth/callback`
  is registered on the OAuth client, so production sign-in is open. The wiring
  is verified as far as it can be without a real Google account: the provider is
  configured on production PocketBase, and `redirectUriFor` produces exactly
  that URI from `NEXT_PUBLIC_APP_URL`.
- **The front-door error box** (#21). Opening the site no longer renders an
  alert; `unauthorized` is a note, and only genuine failures get the board's
  correction voice.

## Verification status

Last full local run, on slice 2.2: **all green.**

| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test` | **238 passed** — 157 of them the engine |
| `npm run build` | pass |
| `npm run test:e2e` | 50 passed (chromium + Pixel 7) |
| `npm run pb:verify` | 33 checks pass |
| `npm run pb:verify:oauth2` | 7 checks pass |

> Running E2E from a git worktree? Pass `E2E_PORT` — Playwright's
> `reuseExistingServer` will otherwise reuse a dev server from a *different*
> checkout and silently test that working copy's code.

A full `migrate down` of all seven migrations followed by a re-apply reproduces
a byte-identical schema dump — checked locally as well as in CI.

**In production**, on the deployed box:

| Check | Result |
|---|---|
| `https://eurovafliai.labrium.online/login` | 200 over TLS |
| `http://` → `https://` | 301 |
| `/pb/api/health` through the proxy | healthy |
| `/pb/_/` (admin UI) | 403, as intended |
| **SSE through the proxy** | `PB_CONNECT` in **0.1s**, unbuffered |
| `npm run pb:verify` against the production database | 33 checks pass |
| Sibling apps after our install | all 8 PM2 apps and 4 PocketBase units still up |

CI is green on `main`. The `main` ruleset enforces linear history, squash-only
merges, no force-push, no deletion, and no bypass actors. Both `verify` and
`pocketbase` are **required** status checks, so a migration that widens a read
rule can no longer reach `main`.

---

## Keeping this file honest

Update it **in the same PR** as the work it describes; the PR template has a
checkbox for exactly this. A slice is not finished when its code merges — it is
finished when this file says so and the claim is true.

When a PR defers part of its scope, that deferral goes **here**, as a `partial`
row or a line in Open debt. A deferral recorded only in a PR description is
invisible to the next agent, which is how 1.3b went missing.
