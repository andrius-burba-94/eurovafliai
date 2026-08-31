# Eurovafliai

A private, invite-based **Euroleague fantasy draft platform** for one friend
group. A commissioner configures a league, friends join a lobby, the
commissioner rolls the draft order and runs a **live draft that every
participant watches update simultaneously** on their own phone or laptop. After
the draft the app tracks real Euroleague performance nightly (PIR + fantasy
points), computes standings, and measures the point impact of every trade.

Season: **Euroleague 2026–27** (20 clubs, 38 regular-season rounds). Scale target
is ~10 concurrent users — optimize for correctness and clarity, never for
horizontal scale. Phases ship in order; nothing here is planned against a date.

**Roster template:** 13 players — 5 Guards, 5 Forwards, 3 Centers → 13 rounds.

> **Where the project is right now: [docs/STATUS.md](docs/STATUS.md).** Read it
> before proposing work — it is the only place that says which slices are done,
> which are next, and what debt is being carried. Do not infer status from this
> file or from git log.
>
> The master plan is [docs/EUROVAFLIAI_BLUEPRINT.md](docs/EUROVAFLIAI_BLUEPRINT.md)
> — read it too, and treat its decision log (§2) as locked. The blueprint says
> where we are going and does not move; STATUS.md says how far along we are.

## Stack

- **Next.js 16** (App Router, Turbopack) + **React 19** + **TypeScript strict** +
  **Tailwind v4**. Node **24** (`.nvmrc`, `engines`).
- **PocketBase 0.39.x** native binary, pinned in `pb/VERSION`, bound to
  `127.0.0.1:8095`. Schema is code: migrations in `pb/pb_migrations/`, committed.
- **Vitest** (unit) + **Playwright** (E2E, `tests/e2e/`, local-first).
- Realtime is **PocketBase SSE**; the browser subscribes through the Nginx
  `/pb/` proxy with the user's auth token.

## Commands

```bash
npm run dev          # Next (:3007) + PocketBase (:8095) together
npm run dev:clean    # same, after clearing a stale .next cache
npm run worker:dev   # the pick-timer / stats worker (tsx watch)
npm run lint         # eslint
npm run typecheck    # next typegen && tsc --noEmit
npm run test         # vitest (unit only — E2E is excluded on purpose)
npm run test:e2e     # playwright
npm run build        # next build
npm run pb:verify    # assert PB rules + unique indexes hold (PB must be running)
npm run pb:verify:oauth2  # prove first-time Google sign-up still works (PB must be running)
./scripts/pb-download.sh   # fetch the pinned PocketBase binary
```

First run: `fnm use` (Node 24, enforced by `engine-strict`), then
`npm i && npm run setup && cp .env.example .env`, fill in `.env`, then
`npm run dev`. (`setup` = PocketBase binary + git hooks.) The app is at
`http://localhost:3007` — `localhost`, not `127.0.0.1`, for Google's sake.

## Architecture in one screen

```
Browser ──HTTPS──> Nginx ──> Next.js 16 (PM2, :3007)   all WRITES via server actions
                     └──/pb/──> PocketBase (systemd, 127.0.0.1:8095)
                                 realtime SSE ──> browsers subscribe
                          Worker (PM2, same repo): pick timers, autodraft,
                                                   nightly stats, standings
```

Non-negotiables (details in the skills below):

1. **Server-authoritative draft state.** Clients render and request; they never
   decide whose turn it is or that a timer expired.
2. **The engine library is pure.** `src/lib/engine/` has zero PocketBase
   imports and no I/O — it is shared by server actions and the worker, and it is
   the most heavily tested code in the repo.
3. **PocketBase has no transactions.** Validate-then-write, unique indexes as
   the physical backstop, idempotent repair. Every multi-write PR states its
   failure-recovery story.
4. **Writes use a superuser client server-side; reads use the user's token**, so
   PB API rules stay meaningful as defense-in-depth.

## Where to look

| Topic | Read |
|---|---|
| **What is done and what is next** | **`docs/STATUS.md`** |
| The whole plan, phase by phase | `docs/EUROVAFLIAI_BLUEPRINT.md` |
| Domain vocabulary (use these words) | `CONTEXT.md` |
| Why the stack / realtime / no-transactions design | `docs/adr/` |
| Product intent, users, principles | `PRODUCT.md` |
| Design system: tokens, components, the state language | `DESIGN.md` (+ `.impeccable/design.json`) |
| Next.js 16 specifics | `AGENTS.md` → `node_modules/next/dist/docs/` |

## Skills in this repo

Invoke these; they carry the rules that matter.

- **`pocketbase-patterns`** — PB quirks, no-transaction defense, migration
  discipline, filter/rule syntax. Any PB-touching change.
- **`draft-engine-invariants`** — server authority, engine purity,
  pick-then-advance, clock handling, format test requirements.
- **`vps-deploy`** — deploy flow, PM2 + systemd layout, the SSE-safe Nginx
  vhost, backups, never-patch-in-production.

Process skills come from the `mattpocock-skills` plugin. The per-slice loop is:

```
/grill-with-docs → /to-spec → /to-tickets → /implement (drives /tdd + /code-review)
→ PR → CI → [UI slices: /impeccable critique|polish] → squash-merge → deploy
```

`/impeccable` owns design work.

## Agent skills

### Issue tracker

Issues live in this repo's **GitHub Issues** (private, `gh` CLI). See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical labels, unchanged: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

**Single-context**: root `CONTEXT.md` + `docs/adr/`. See `docs/agents/domain.md`.

## Working agreements

- **One slice per PR**, granular commits, squash-merge, linear history on `main`.
- **`docs/STATUS.md` is updated in the same PR as the work it describes.** A
  slice is not finished when its code merges — it is finished when STATUS.md
  says so and the claim is true. If a PR defers part of its scope, that
  deferral is recorded in STATUS.md, not only in the PR description: the next
  agent reads the repo, not your merged pull requests.
- Schema changes ship as migration files in the same PR as the code needing them.
- `.env.example` is updated in the same PR that introduces a new variable.
- UI slices are mobile-first (draft night is phones on a couch), respect
  `prefers-reduced-motion`, and handle empty/loading/error states.
- Nothing latency- or fairness-critical depends on an LLM. Autodraft and pick
  legality are deterministic, forever.

@AGENTS.md
