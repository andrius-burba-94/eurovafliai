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

Conventions that only apply to a surface live in `.claude/skills/` (Claude and
Cursor both load them). Invoke the skill that matches the files you are
touching rather than re-deriving the rules from memory. Production bugs already
paid for live in those skills as **Known gotchas** — do not re-debug them.

## Layout

```
src/app/          Next App Router — RSC pages, server actions
src/lib/engine/   PURE draft logic. Zero PocketBase imports, zero I/O —
                  enforced by purity.test.ts, not just documented. Import
                  from its index.ts, not from the modules directly.
src/components/   shared UI in the board's vocabulary (board.tsx) — see DESIGN.md
src/lib/rosters/  roster ingestion: pure normalize/diff + the API front door.
                  `rename.ts` (4.2) decides whether an arrival is a rename —
                  token containment, not a fuse threshold
src/lib/mapping/  player mapping (4.2): queries + actions. A merge keeps the
                  stored player's id so picks, sheets and box scores survive
src/lib/config/   validated env: schema.ts (pure) + public.ts + server.ts
src/lib/drafts/   the pick pipeline. `pipeline.ts` is framework-free and shared
                  verbatim with the worker; `actions.ts` is the request-facing
                  half (session, permissions, revalidation). One pipeline, so a
                  human pick and an autodraft cannot diverge
src/lib/sheets/   cheat sheets: pure parse + fuzzy match, stored shape, reorder
                  arithmetic, framework-free `store.ts` (worker autodrafts from a sheet)
src/lib/cues/     on-the-clock cue decision — pure; fires on turn transition only
src/lib/chat/     league chat: pure `messages.ts`, framework-free `store.ts`,
                  `actions.ts`. `announce()` never throws
src/lib/memberships/  roster windows (5.1) and recorded trades (5.2):
                  pure `fromPicks` / `planTransaction` + framework-free
                  `store.ts` (materialize, apply). Scoring joins `from_round`/
                  `to_round`. Actions are the request-facing half.
src/lib/euroleague/http.ts  ONE HTTP client for the Euroleague feed
src/lib/stats/    box scores and scoring; `scoring.ts` is pure; golden fixtures.
                  `impact.ts` is the live in-minus-out for a recorded deal
src/lib/pb/browser.ts  the page's ONE shared realtime client
src/lib/csv/      one CSV line splitter, shared by both paste-a-sheet doors
src/lib/positions.ts  position words and the one list-join
src/worker/       PM2 worker: ~1s sweep, autodraft, stats ingest
pb/VERSION        pinned PocketBase version — the download script reads it
pb/pb_migrations/ schema as code, COMMITTED
pb/pb_data/       local database, gitignored
scripts/          pb-download, seed, deploy helpers
tests/e2e/        Playwright. Excluded from Vitest on purpose.
docs/STATUS.md    what is done, what is next — update it in the same PR
docs/log/         how it got there: slice notes, deploy checks, verification record
docs/adr/         architecture decision records
docs/research/    findings verified against the real thing, with the date
.claude/skills/   path-scoped project skills (see CLAUDE.md)
```

Unit tests sit next to their subject as `*.test.ts` (`src/**`); Vitest picks
those up plus `tests/unit/**`. Shared test doubles live in
`tests/unit/helpers/` — `fake-pb.ts` is deliberately strict: it enforces the
real unique indexes and throws on a filter it cannot parse.

## Before you write code

1. Read [docs/STATUS.md](docs/STATUS.md) first — it says which slices are done,
   which is next, and what debt is being carried. Never infer that from git log
   or from a merged PR description.
2. Read the blueprint section for the slice you are on, and the ADRs it cites.
3. Invoke the skill that covers the surface you are touching (see CLAUDE.md).
4. Use the vocabulary in [CONTEXT.md](CONTEXT.md). Names in code match names in
   the league's chat.
5. For Next.js APIs, check `node_modules/next/dist/docs/` rather than memory.

## Non-negotiables

- Draft state is **server-authoritative**. Clients render and request only.
- `src/lib/engine/` stays **pure** — no PB, no I/O, time passed in as an argument.
- PocketBase has **no transactions**: validate-then-write, unique indexes,
  idempotent repair. State the failure-recovery story in the PR.
- Never trust a client clock. The worker enforces pick deadlines.
- Every draft-format change ships `buildPickOrder` tests for all formats and odd
  member counts.
- After logic changes: `npm run lint`, `npm run typecheck`, and `npm run test`
  (see the `testing-requirements` skill). UI slices also follow DESIGN.md and
  `component-reuse`.
