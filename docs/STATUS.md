# Status

**What is done, what is next.** This file is the single answer to "where is this
project?" — read it before proposing work, and update it in the same PR that
changes what it describes.

It is deliberately *not* the plan. The plan is
[EUROVAFLIAI_BLUEPRINT.md](EUROVAFLIAI_BLUEPRINT.md) and it does not move; this
file records how far through it we are. When the two disagree, the blueprint
defines the target and this file is wrong.

> **Phase 1 — walking skeleton. In progress.**
> Auth, league creation, join-by-code and the design foundation have landed.
> The lobby is not finished: it does not update live, and it cannot show who is
> in it. Nothing is deployed yet.

**Next up:** slice **1.3b** — finish the lobby (issue #15, realtime member list,
team names, kick, mark-ready), then **1.5** — deploy.

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

**In progress.** DoD — *"phone + PC, two Google accounts, live lobby on the
production subdomain"* — is **not met**: the member list is not live, members
render as "Unknown member" (#15), and there is no production deployment.

| Slice | State | Landed | Notes |
|---|---|---|---|
| 1.1 Schema — `leagues`, `league_members`, Google OAuth2 on `users` | done | #2 | 5 migrations; rules and indexes asserted by `npm run pb:verify` |
| 1.2 Auth — Google sign-in, httpOnly session, route protection | done | #6, #11, #12, #13 | Public sign-up closed; first-time OAuth2 sign-up proven against a local OIDC issuer |
| 1.3a League & lobby — create, join by code, lobby page | **partial** | #10 | See 1.3b — the realtime list and the commissioner controls were deferred out of this PR |
| **1.3b Lobby, finished** | **next** | — | Realtime SSE member list (first use of the `authToken` pattern); team names; kick; mark-ready (needs an `is_ready` migration); **and issue #15**, without which the list has no names to show |
| 1.4 Design foundation — tokens, app shell, the board's vocabulary | done | #17 | The Draft Board Wall. Contract recorded in `DESIGN.md` |
| 1.5 Deploy — VPS, PM2 + systemd, SSE-safe Nginx, `deploy.sh`, auto-deploy | todo | — | VPS exists; the app is not set up on it. No GitHub secrets configured yet. Spec is the `vps-deploy` skill |

## Phases 2–8

Not started. One line each; the detail lives in the blueprint.

| Phase | State |
|---|---|
| 2 — Draft engine v1 (linear + snake + 3RR), the TDD phase | todo |
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
| [#15](https://github.com/andrius-burba-94/eurovafliai/issues/15) | The lobby renders every other member as "Unknown member" — `users` still has PocketBase's self-only read rules, so `expand: "user"` returns nothing for anyone but the viewer | Phase 1 DoD; folded into 1.3b |
| [#16](https://github.com/andrius-burba-94/eurovafliai/issues/16) | League action errors travel as finished prose in the query string and render into a `role="alert"` — attacker-controllable text | Nothing; correctness debt in the leagues slice |

## Verification status

Last full local run, on `a7d654d` (Phase 1.4 merged): **all green.**

| Check | Result |
|---|---|
| `npm run lint` | pass |
| `npm run typecheck` | pass |
| `npm run test` | 58 passed |
| `npm run build` | pass |
| `npm run test:e2e` | 30 passed (chromium + Pixel 7) |
| `npm run pb:verify` | 25 checks pass |
| `npm run pb:verify:oauth2` | 7 checks pass |

CI is green on `main`. The `main` ruleset enforces linear history, squash-only
merges, no force-push, no deletion, and no bypass actors.

> **Note:** only the `verify` CI job is a *required* status check. The
> `pocketbase` job — the one that proves a migration has not widened a read rule
> — runs on every PR but does not block a merge. Worth promoting.

---

## Keeping this file honest

Update it **in the same PR** as the work it describes; the PR template has a
checkbox for exactly this. A slice is not finished when its code merges — it is
finished when this file says so and the claim is true.

When a PR defers part of its scope, that deferral goes **here**, as a `partial`
row or a line in Open debt. A deferral recorded only in a PR description is
invisible to the next agent, which is how 1.3b went missing.
