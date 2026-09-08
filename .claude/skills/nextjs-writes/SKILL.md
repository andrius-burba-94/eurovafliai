---
name: nextjs-writes
description: Next.js App Router conventions for this repo — server actions for all writes, RSC vs client split, one PocketBase browser client, env inlining, React 19 form pitfalls. Use when adding or changing pages, server actions, client components, forms, or anything under src/app or src/lib/config.
paths:
  - "src/app/**"
  - "src/lib/config/**"
  - "src/lib/**/actions.ts"
  - "next.config.ts"
---

# Next.js writes in this repo

This is Next 16. Read `node_modules/next/dist/docs/` before using an API you
remember from an older major. `next.config.ts` is fine here — the old
TypeScript-config production caveat no longer applies.

## Writes

- **All writes go through server actions** (session, permissions,
  `revalidatePath`). Clients render and request; they never decide whose turn
  it is or that a timer expired.
- Pick legality, autodraft, and clock expiry are **server/worker**, never
  client-side.
- Multi-write actions state a **failure-recovery story** in the PR (PocketBase
  has no transactions). See `pocketbase-patterns`.

## Server vs client

- Default to Server Components. `"use client"` only for event handlers, hooks,
  browser APIs, or a third-party client library.
- Put `"use client"` at the top of the file.
- Shared board vocabulary in `src/components/board.tsx` is server-safe on
  purpose. Do not drag it across the client boundary to add a click handler —
  wrap it.

## One PocketBase browser client

Live surfaces share `src/lib/pb/browser.ts`. A second `new PocketBase()` in an
effect hangs the first subscription. Details in `pocketbase-patterns`.

## Env and Node vs Next

- **`NEXT_PUBLIC_*` inlining** — Next only inlines a public env var when
  `process.env.NEXT_PUBLIC_FOO` appears *literally* in source.
  `src/lib/config/public.ts` spells each key out; do not spread `process.env`.
- **`server-only` in plain Node** — importing `src/lib/config/server.ts` from
  the worker or a script throws. Use `parseServerEnv` from
  `src/lib/config/schema.ts` there.
- **Stale `.next` cache** → `npm run dev:clean`. Brave hydration-mismatch
  noise in the console is not a real bug.

## Forms and React 19

- **React 19 resets uncontrolled inputs** after a server-action transition.
  Control the input (both paste boxes do). E2E specs must refill if they still
  hit an uncontrolled field.
- **A `<textarea>` submits CRLF.** `formData.get("csv")` comes back with
  `\r\n` where React state holds `\n`. Normalise before comparing (`sameText`
  in the import forms).
- **Two `useActionState`s on one form are a trap.** Prefer one action with an
  `intent` field (`submitCheatSheet`). Shipped broken in 2.1b.
- **`useActionState` keeps the previous result.** Return the id of the thing
  that succeeded; `{ ok: true }` is not "did *this* one succeed".
- **Re-keying a form to re-seed it throws away its `useActionState`.** Adjust
  state during render against the last seeded prop when the box is untouched.

## Fetch memoization

Next memoizes identical GET fetches within one render pass. The PocketBase SDK
uses `fetch`, so read → repair → read-again is stale. Repair before the read.
See `pocketbase-patterns` and `src/lib/leagues/queries.ts`.

## Data loading and failure policy

- Fetch independent PocketBase reads with `Promise.all`; do not introduce
  sequential `await` waterfalls. Preserve required ordering around repairs.
- **Fail loud** for the facts that make a page truthful: session, league,
  draft, picks, members, player pool, clock state.
- **Fail soft** for supplementary surfaces: chat and a personal cheat sheet may
  degrade to empty without taking down the draft room. Log the failure
  server-side; never replace primary data with an empty value.
- If it is unclear whether data is primary, ask: would continuing let a member
  make a wrong pick? If yes, fail loud.
- Server actions return a deliberately tagged `SafeActionError` through
  `src/lib/safe-error.ts`; logs may use `describeError`. Never return a raw
  PocketBase response, constraint, field, or provider message to the browser.
