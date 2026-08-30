<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Working in this repo

Project overview, stack, commands and working agreements live in
[CLAUDE.md](CLAUDE.md). The master plan is
[docs/EUROVAFLIAI_BLUEPRINT.md](docs/EUROVAFLIAI_BLUEPRINT.md). Read both before
changing anything.

## Layout

```
src/app/          Next App Router — RSC pages, server actions
src/lib/engine/   PURE draft logic. Zero PocketBase imports, zero I/O. (Phase 2)
src/lib/config/   validated env: schema.ts (pure) + public.ts + server.ts
src/worker/       PM2 worker: pick timers, autodraft, nightly stats (Phase 2.5)
pb/VERSION        pinned PocketBase version — the download script reads it
pb/pb_migrations/ schema as code, COMMITTED
pb/pb_data/       local database, gitignored
scripts/          pb-download.sh (+ deploy tooling from Phase 1.5)
tests/e2e/        Playwright. Excluded from Vitest on purpose.
docs/adr/         architecture decision records
.claude/skills/   project skills: pocketbase-patterns, draft-engine-invariants, vps-deploy
```

Unit tests sit next to their subject as `*.test.ts` (`src/**`); Vitest picks
those up plus `tests/unit/**`.

## Before you write code

1. Read the blueprint section for the slice you are on, and the ADRs it cites.
2. Invoke the skill that covers the surface you are touching —
   `pocketbase-patterns`, `draft-engine-invariants` or `vps-deploy`.
3. Use the vocabulary in [CONTEXT.md](CONTEXT.md). Names in code match names in
   the league's chat.
4. For Next.js APIs, check `node_modules/next/dist/docs/` rather than memory.

## Non-negotiables

- Draft state is **server-authoritative**. Clients render and request only.
- `src/lib/engine/` stays **pure** — no PB, no I/O, time passed in as an argument.
- PocketBase has **no transactions**: validate-then-write, unique indexes,
  idempotent repair. State the failure-recovery story in the PR.
- Never trust a client clock. The worker enforces pick deadlines.
- Every draft-format change ships `buildPickOrder` tests for all formats and odd
  member counts.

## Known gotchas (do not re-debug these)

- **Vitest/Playwright glob collision** — `tests/e2e/**` is excluded in
  `vitest.config.mts`. Keep it that way.
- **`NEXT_PUBLIC_*` inlining** — Next only inlines a public env var when
  `process.env.NEXT_PUBLIC_FOO` appears *literally* in source. `src/lib/config/public.ts`
  spells each key out for this reason; do not "simplify" it to spreading `process.env`.
- **`server-only` in plain Node** — importing `src/lib/config/server.ts` from the
  worker or a script throws. Use the pure `parseServerEnv` from
  `src/lib/config/schema.ts` there.
- **React 19 resets uncontrolled inputs** after a server-action transition. Chat
  and pick forms must handle it; E2E specs must refill.
- **Stale `.next` cache** → `npm run dev:clean`. Brave hydration-mismatch noise
  in the console is not a real bug.
- **PocketBase `checksums.txt` is combined** for the whole release, so
  `pb-download.sh` verifies only our archive's line. Not a bug to fix.
- **`localhost` and `127.0.0.1` are not interchangeable here.** Google treats them
  as different redirect URIs, and only `http://localhost:3007/auth/callback` is
  registered on the OAuth client — so anything that builds the app's own
  browser-facing origin (the OAuth redirect above all) must say `localhost`.
  PocketBase URLs are the exact opposite: keep them on `127.0.0.1`, because the
  PB JS SDK fails against `localhost` on IPv6-first resolvers (its own error
  message tells you to switch). Rule: **`localhost` for the app's public origin,
  `127.0.0.1` for PocketBase.** Getting it backwards surfaces as
  `redirect_uri_mismatch` from Google, or `ECONNREFUSED ::1` from the SDK.
- **`next.config.ts` is fine on Next 16** — the old TS-config production caveat
  no longer applies.
