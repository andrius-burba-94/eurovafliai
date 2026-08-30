# Eurovafliai

Private Euroleague fantasy draft platform for one friend group: a live,
real-time draft that every participant watches update on their own device, then
nightly stats, standings and trade-impact tracking for the rest of the season.

**Production:** `https://eurovafliai.labrium.online` · **Season:** Euroleague
2026–27 · **Rosters:** 13 players (5G / 5F / 3C)

> **Status: Phase 0 — repository bootstrap.** Nothing is deployed yet. The plan
> is [docs/EUROVAFLIAI_BLUEPRINT.md](docs/EUROVAFLIAI_BLUEPRINT.md).

## Quick start

```bash
fnm use || nvm use           # Node 24, from .nvmrc — npm refuses other versions
npm install
npm run setup                # PocketBase binary (SHA256-verified) + git hooks
cp .env.example .env         # then fill it in
npm run dev                  # Next on :3007 + PocketBase on :8095
```

Node **24** is required, not suggested: `.npmrc` sets `engine-strict=true`, so
npm stops rather than warns on another version. No version manager yet?

```bash
curl -fsSL https://fnm.vercel.app/install | bash   # then restart your shell
```

Open the app at **http://localhost:3007** — `localhost`, not `127.0.0.1`: only
that origin is registered as a Google OAuth redirect URI.

Create the PocketBase superuser once, using the credentials you put in `.env`:

```bash
./pb/pocketbase superuser upsert "$PB_SUPERUSER_EMAIL" "$PB_SUPERUSER_PASSWORD" --dir=pb/pb_data
```

The admin UI is then at `http://127.0.0.1:8095/_/` locally. In production it is
blocked at the proxy — reach it through an SSH tunnel.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Next (`:3007`) and PocketBase (`:8095`) together |
| `npm run dev:clean` | Clears a stale `.next` cache, then `dev` |
| `npm run worker:dev` | The pick-timer / stats worker, watched |
| `npm run lint` · `typecheck` · `test` | ESLint · `next typegen && tsc --noEmit` · Vitest |
| `npm run test:e2e` | Playwright (boots the dev server itself) |
| `npm run build` · `start` | Production build · serve on `:3007` |
| `./scripts/pb-download.sh` | Install the PocketBase version pinned in `pb/VERSION` |
| `npm run pb:verify` | Check the PocketBase API rules and unique indexes still hold (needs PB running) |
| `./scripts/google-oauth-wizard.sh` | Interactive walkthrough of the Google Cloud OAuth setup |
| `npm run --silent pb:dump-schema` | Print the schema as stable, secret-free JSON (used by CI to diff a rollback round-trip) |

`PB_TARGET=linux_amd64 ./scripts/pb-download.sh` fetches the VPS binary from any
machine.

## Stack

Next.js 16 (App Router, Turbopack) · React 19 · TypeScript strict · Tailwind v4 ·
Node 24 · PocketBase 0.39.x (native binary, `127.0.0.1:8095`, schema as
committed migrations) · Vitest + Playwright · PM2 + Nginx + Certbot on a
Hostinger VPS.

Realtime is PocketBase SSE straight to the browser; a separate worker process
enforces pick deadlines and runs nightly stats. See
[docs/adr/](docs/adr/) for why.

## Layout

```
src/app/          App Router pages and server actions
src/lib/engine/   pure draft logic — no PocketBase, no I/O (Phase 2)
src/lib/config/   validated environment
src/worker/       pick timers, autodraft, nightly stats (Phase 2.5)
pb/               pinned binary + committed pb_migrations/
tests/e2e/        Playwright specs
docs/adr/         architecture decision records
```

## Contributing

One vertical slice per PR, squash-merged, linear history. CI runs lint,
typecheck, unit tests and a build on every PR. Schema changes ship as migration
files in the same PR as the code that needs them. Multi-write server actions
must state their failure-recovery story — PocketBase has no transactions.

GitHub's branch protection needs a paid plan on a private repo, so the guard is
local: `npm run setup:hooks` installs a `pre-push` hook that refuses direct
pushes to `main`. Repo settings already allow squash merges only.

Agent workflow, domain vocabulary and the non-negotiables are in
[CLAUDE.md](CLAUDE.md), [AGENTS.md](AGENTS.md) and [CONTEXT.md](CONTEXT.md).

Private project. Not accepting external contributions.
