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
is local-first and is **not** in CI — still run the specs that cover the
surface you touched.

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
