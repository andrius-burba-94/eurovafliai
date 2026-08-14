# ADR-0001 — Stack: Next.js 16 + PocketBase on a single VPS

- **Status:** accepted
- **Date:** 2026-08-14
- **Context source:** blueprint §2 decisions D1–D3

## Context

Eurovafliai is a private fantasy draft platform for one friend group: roughly
8–12 participants, 10 concurrent users at peak (draft night), built from scratch
by AI agents and reviewed by a single maintainer. It must be live on a
subdomain of an existing Hostinger VPS that already hosts sibling apps
(Inkliuzas, Centfolio), and the whole thing has to be correct before draft night
in September 2026.

The dominant constraints are therefore **agent productivity** and
**correctness**, not scale. Anything that makes an agent guess — an unfamiliar
framework, a bespoke realtime layer, a second deployment target — costs more
than it saves.

## Decision

**Next.js 16 (App Router, Turbopack) + React 19 + TypeScript strict +
Tailwind v4 on Node 24, with PocketBase 0.39.x as a pinned native binary bound
to `127.0.0.1:8095`, both on the existing VPS behind Nginx.** Next runs on
`:3007` under PM2; PocketBase runs under systemd.

The deciding factor is that this is the *same* stack as the maintainer's two
existing production apps. Every hard-won lesson transfers directly: the
httpOnly-cookie auth pattern, the PocketBase quirk list, the PM2 + Nginx +
Certbot layout, the CI shape, and the accumulated agent rules that now live in
`.claude/skills/pocketbase-patterns` and `.claude/skills/vps-deploy`. A
"better" unfamiliar stack would start that ledger from zero.

PocketBase specifically buys three things this product needs in one binary:
a SQLite datastore, auth with Google OAuth2, and **realtime subscriptions over
SSE** — which is the entire mechanism behind "every device sees the same draft".

## Consequences

**Good**

- Realtime needs no extra service, no websocket server, no Redis.
- One binary + one Node process to operate; SQLite backups are file copies.
- Prior-art transfer means agents make fewer novel mistakes.
- Vertical scale is ample: 10 users, ~350 players, 38 rounds is tiny.

**Costs, accepted**

- **PocketBase has no transactions.** This is the single biggest consequence and
  gets its own record — see [ADR-0003](ADR-0003-no-transactions.md).
- Horizontal scale is not available. Deliberate: a public multi-league product
  is a non-goal (blueprint §1).
- SSE through Nginx needs explicit anti-buffering config, and it can only be
  verified in production. Encoded in the `vps-deploy` skill and in the Phase 1.5
  definition of done.
- Next.js 16 is recent enough that model training data is unreliable; hence the
  standing rule to read `node_modules/next/dist/docs/` rather than recall.

## Alternatives considered

| Option | Why not |
|---|---|
| Supabase / Postgres | Real transactions and a great DX, but a hosted dependency, a new quirk ledger, and RLS to learn — for 10 users. |
| Custom Node + SQLite + websockets | Full control, but we would hand-build auth, realtime and an admin UI that PocketBase already ships. |
| Firebase | Realtime is excellent; vendor lock-in, pricing opacity and a data model that fights relational draft state. |
| SvelteKit / Remix | Plausible, but discards the transferable Next-specific ledger for no product gain. |
