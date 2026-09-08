---
name: testing-requirements
description: Testing requirements for this repo — run lint, typecheck and Vitest after logic changes; Playwright glob collision; screenshot and fixture traps. Use when writing, running, or reviewing tests, or after modifying application code.
paths:
  - "src/**/*.ts"
  - "src/**/*.tsx"
  - "tests/**"
  - "vitest.config.mts"
  - "playwright.config.ts"
---

# Testing requirements

## After logic changes

After modifying application or test code, run:

```bash
npm run lint
npm run typecheck
npm run test
```

That is ESLint, `next typegen && tsc --noEmit`, and Vitest (unit only). Do not
claim the change works without having run them. Playwright (`npm run test:e2e`)
runs in CI too, against `next start` over a fresh build and a throwaway
PocketBase — but a red CI run twenty minutes later is a slow way to learn what
a local run of the specs covering your surface would have told you in two.
Run those before pushing. `npm run lint:dead` (knip) is also in CI.

Trivial comment-only edits do not need the full suite. Logic, schema, engine,
worker, and UI behavior changes do.

## How tests are laid out

- Unit tests sit next to the subject as `*.test.ts`. Vitest also picks up
  `tests/unit/**`.
- `fake-pb.ts` enforces real unique indexes and throws on unparseable filters.
  Do not weaken it to make a test pass.
- Engine purity and worker framework-freedom are tests
  (`purity.test.ts`, `framework-free.test.ts`), not comments.

## Known gotchas

- **Vitest/Playwright glob collision** — `tests/e2e/**` is excluded in
  `vitest.config.mts`. Keep it that way.
- **A screenshot used as evidence must assert something about its own
  content.** Drive the UI, `expect` a count or a rendered string, then
  `screenshot()`. Two identical screenshots have already been handed to a
  design review as "the radar at 20 and at 60 picks".
- **A test that deletes every row of a collection is app-global.**
  `tests/e2e` runs `fullyParallel`. Scope destructive fixtures to the league
  or member under test — same trap as `sweepOnce`.
- **A local E2E run that fails in two or three scattered specs is usually the
  dev server, not the code.** `playwright.config.ts` reuses a running
  `next dev` and local runs have `retries: 0`, so a server that has been up for
  hours recompiling the day's edits loses 5-second waits under eight parallel
  workers. Measured once: three consecutive runs failed 1, 2 and 4 *different*
  specs, every one passing alone; row counts in PocketBase were healthy;
  restarting `npm run dev` made the suite green **and 40% faster** (3.4m vs
  5.7m). Check row counts first, then restart the server, and only then suspect
  the diff. CI builds fresh and runs `retries: 1`.
- **`chat.spec.ts`'s rate-limit spec is the most load-sensitive in the suite.**
  It sends twice inside one window on purpose, so under parallel load the two
  sends can straddle the window and the refusal never comes. Passes in
  isolation. Not a bug in the rate limit; do not "fix" it by widening the
  window, which would weaken the guard it exists to prove.
- **A fixture that fakes a display name will hide a real defect.** Read names
  the way the product does; do not pass `say: { teamName: "Fixture FC" }` into
  `commitPick` unless the spec is about that placeholder.
- **Removing a surface breaks the specs that used it as a lens.** The board
  (`[data-board-slot][data-state="filled"]`) is the durable pick count; chat
  is the durable sentence. The board cell truncates long names — assert full
  names on the transcript.
- **Changing one interaction breaks every spec that used it.** Route draft
  taps through helpers (`draftPlayer`, `submitPick`). A refusal spec must not
  wait for the confirm control to vanish — a refused pick keeps it.
- **Never assume who the roll put first.** See `draft-engine-invariants`.
- **`page.touchscreen` can only tap.** Real touch drag goes through CDP
  `Input.dispatchTouchEvent`. Synthetic `PointerEvent`s carry no live pointer
  id, so `setPointerCapture` throws.
- **Assert computed styles with `expect.poll`**, not a single `evaluate`.
  Chromium can report a stale computed style in the same frame as the class
  change.
