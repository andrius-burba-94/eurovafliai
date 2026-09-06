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
src/lib/engine/   PURE draft logic. Zero PocketBase imports, zero I/O —
                  enforced by purity.test.ts, not just documented. Import
                  from its index.ts, not from the modules directly.
src/components/   shared UI in the board's vocabulary (board.tsx) — see DESIGN.md
src/lib/rosters/  roster ingestion: pure normalize/diff + the API front door
src/lib/config/   validated env: schema.ts (pure) + public.ts + server.ts
src/lib/drafts/   the pick pipeline. `pipeline.ts` is framework-free and shared
                  verbatim with the worker; `actions.ts` is the request-facing
                  half (session, permissions, revalidation). One pipeline, so a
                  human pick and an autodraft cannot diverge
src/lib/sheets/   cheat sheets: pure parse + fuzzy match, the stored shape
                  (`ranking.ts`), `reorder.ts` (the edit arithmetic, run once
                  optimistically and once authoritatively) and `store.ts` —
                  framework-free like the pipeline, because the worker
                  autodrafts from a sheet
src/lib/csv/      one CSV line splitter, shared by both paste-a-sheet doors
src/lib/positions.ts  the position words and the one list-join ("5 guards, 5
                  forwards and 3 centers"). Shared by the radar and the sheet;
                  it existed twice before, and the second copy joined with
                  " and " so three positions read "5 G and 5 F and 3 C"
src/worker/       PM2 worker: the ~1s sweep — pick deadlines, autodraft and the
                  repairs no request would notice. Nightly stats join it in 4.3
pb/VERSION        pinned PocketBase version — the download script reads it
pb/pb_migrations/ schema as code, COMMITTED
pb/pb_data/       local database, gitignored
scripts/          pb-download.sh, seed-members.mts (+ deploy tooling from Phase 1.5)
tests/e2e/        Playwright. Excluded from Vitest on purpose.
docs/STATUS.md    what is done, what is next — update it in the same PR
docs/adr/         architecture decision records
docs/research/    findings verified against the real thing, with the date
docs/runbooks/    one-time operational procedures (VPS setup)
.claude/skills/   project skills: pocketbase-patterns, draft-engine-invariants, vps-deploy
```

Unit tests sit next to their subject as `*.test.ts` (`src/**`); Vitest picks
those up plus `tests/unit/**`. Shared test doubles live in
`tests/unit/helpers/` — `fake-pb.ts` is the PocketBase stand-in the worker's
sweep is tested against, and it is deliberately strict: it enforces the real
unique indexes and throws on a filter it cannot parse, so it cannot quietly
make broken code pass.

## Before you write code

1. Read [docs/STATUS.md](docs/STATUS.md) first — it says which slices are done,
   which is next, and what debt is being carried. Never infer that from git log
   or from a merged PR description.
2. Read the blueprint section for the slice you are on, and the ADRs it cites.
3. Invoke the skill that covers the surface you are touching —
   `pocketbase-patterns`, `draft-engine-invariants` or `vps-deploy`.
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

## Known gotchas (do not re-debug these)

- **Vitest/Playwright glob collision** — `tests/e2e/**` is excluded in
  `vitest.config.mts`. Keep it that way.
- **`NEXT_PUBLIC_*` inlining** — Next only inlines a public env var when
  `process.env.NEXT_PUBLIC_FOO` appears *literally* in source. `src/lib/config/public.ts`
  spells each key out for this reason; do not "simplify" it to spreading `process.env`.
- **`server-only` in plain Node** — importing `src/lib/config/server.ts` from the
  worker or a script throws. Use the pure `parseServerEnv` from
  `src/lib/config/schema.ts` there.
- **Next memoizes identical GET fetches within one render pass**, and the
  PocketBase SDK uses `fetch`. So read → repair → read-again *does not work*: the
  second read returns the first one's stale result and the repair looks like it
  failed silently. Repair before the read instead (see
  `src/lib/leagues/queries.ts`). Cost us a real debugging session; the write was
  landing in the database all along.
- **React 19 resets uncontrolled inputs** after a server-action transition. Chat
  and pick forms must handle it; E2E specs must refill. The durable fix is to
  *control* the input, which both paste boxes now do.
- **A `<textarea>` submits CRLF.** Form serialisation normalises newlines, so
  `formData.get("csv")` comes back with `\r\n` where React state holds `\n`.
  Any code comparing a server-echoed value against the state in the box must
  normalise first, or the comparison is false for every multi-line paste — which
  is every paste — and the feature looks silently broken. `sameText` in
  `import-form.tsx`.
- **Two `useActionState`s on one form are a trap.** The component then has to
  decide which result is current, and the natural expression of that
  (`applied.plan ? applied : preview`) pins the surface to the last *applied*
  result forever: a new preview changes nothing and React's input reset hands
  back stale text. Prefer one action with an `intent` field
  (`submitCheatSheet`). Shipped broken in 2.1b, found by 3.4a's design critique.
- **The sweep is app-global.** `sweepOnce` looks for *every* live draft, so
  calling it — from a spec, a script or a REPL — against a database where you
  have a draft open by hand will autodraft into that draft. Pass `onlyDraft`
  with the id under test; `tests/e2e/worker.spec.ts` does, and that is why.
- **`readPicks` returns the *engine's* pick shape, not PocketBase's.** It gives
  you `playerId` and `memberId`; the raw records carry `player` and `member`. A
  script that reads `.player` off it gets `undefined` silently — and if that
  value went into a `takenPlayerIds` set, `selectAutoPick` then re-picks a player
  who is already gone and every `commitPick` after the first returns `"raced"`.
  Cost two throwaway scripts that looked like they worked; both produced a draft
  frozen after exactly one pick.
- **A screenshot used as evidence must assert something about its own content.**
  A script that drives a draft and then screenshots it can fail halfway and still
  produce a plausible-looking image. Two identical screenshots were handed to a
  design review as "the radar at 20 and at 60 picks"; both were the radar at one
  pick, and the review's own reader caught it. One `expect` on a count or a
  rendered string before the `screenshot()` call is the whole fix.
- **Interpolated class names compile to nothing.** Tailwind reads source text, so
  `` className={`slot-${state}`} `` emits no CSS at all and the rule silently does
  not exist — a board with its entire state language missing still looks
  plausible in a screenshot. Write the map out (`SLOT_RULE` in `board.tsx` and
  `draft-board.tsx` both do).
- **Two `border-top` utilities on one element do not reliably compose.** Tailwind
  v4 emits `@utility` blocks **alphabetically**, not in source order, and the dev
  server splits them across chunks — so `class="slot-filled slot-transit"`
  composited to **1px dashed**: the width from one rule, the style from the
  other, a material that exists in neither. A slot's state belongs in `Slot`'s
  `state` union, one rule per row, which is what DESIGN.md already asks for.
- **A computed style read in the same frame as the class change is stale.**
  Chromium reported `1px dashed` for an element already carrying `slot-transit`
  and `data-state="transit"`, then `2px dashed` on every read from 60ms on. Assert
  computed styles with `expect.poll`, not a single `evaluate`, or the test fails
  against a material that is perfectly correct.
- **A hand-rolled drag must not read its drop target out of React state.**
  `pointerup` can arrive in the same task as the last `pointermove`, so a handler
  reading `drag.overId` from state sees the pre-move value and the drag silently
  does nothing. Keep the target in a `useRef` and let state drive only the
  drawing. It survived the mouse — Playwright's moves are far enough apart — and
  died under a finger, which is why `cheat-sheet.spec.ts` drives a real touch
  drag through CDP `Input.dispatchTouchEvent`. `page.touchscreen` can only tap,
  and synthetic `PointerEvent`s carry no live pointer id, so `setPointerCapture`
  throws and you end up testing the fallback.
- **A `sticky bottom-0` control bar covers the rows it acts on.** While the page
  is scrolled short of its end, the bar paints over whatever is at the foot of
  the viewport — measured on a Pixel 7 at **218px** tall, sitting exactly on the
  row that had just been picked up, so the first touch of a drag hit the bar and
  Chromium answered `pointercancel`. Reserve space below the list *and* scroll
  the acted-on row to `block: "center"`. Invisible on a desktop viewport, which
  is tall enough that the two never meet.
- **Re-keying a form to re-seed it throws away its `useActionState`.** The cheat
  sheet's paste box has to follow a sheet edited above it, and `key={view.asText}`
  looked like the tidy way — but remounting discarded the action result, so
  saving no longer rendered its own "Saved" confirmation, un-fixing a defect
  3.4a's critique had fixed. Adjust the state during render against the last
  seeded prop instead, and only when the box is untouched, so unsaved typing
  survives.
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
