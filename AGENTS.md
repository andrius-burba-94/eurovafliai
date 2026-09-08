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
src/lib/cues/     the on-the-clock cue's *decision* — pure, so the one rule
                  that matters is testable without a speaker: it fires on the
                  transition into your turn, never on a re-render
src/lib/chat/     league chat: `messages.ts` (every sentence the app can say,
                  pure, so each is testable as prose), `store.ts`
                  (framework-free like the pipeline — the worker announces
                  autodrafted picks) and `actions.ts`. `announce()` never
                  throws: an announcement is the least important write in a
                  pick's sequence and must never fail the pick
src/lib/pb/browser.ts  the page's ONE shared realtime client. A second client
                  makes the first one hang — see the gotcha below
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
- **A hand-rolled drag must hit-test by nearest midpoint, not by containment.**
  A `Slots` run is closed by a gap, and a tier caption sits in it — 36px on a
  Pixel 7 — so containment leaves one dead band per boundary where a drop
  matches no row and silently does nothing. On a tiered list that band is
  exactly where the user aims. Nearest-midpoint has no dead space by
  construction, including above the first row and below the last.
- **`pointerup` is followed by a `click`, and it will undo your drag.** While
  pointer capture keeps both events on the row, the click re-runs the row's own
  activate handler — so a drag released over dead space put the row down and
  picked it straight back up, and the next tap moved it somewhere nobody chose.
  Suppress it with a ref set in the drag's end handler, and **disarm that ref on
  the next macrotask**: on a *successful* drop the click lands on a common
  ancestor and never reaches the handler that would clear it, so a flag left
  armed swallows the next honest tap.
- **A row that travels must take its material with it.** Put the transform on
  the element that carries the state, or move the state onto the element that
  travels. Getting this backwards left a 2px dashed rule sitting on the origin
  while its content translated 242px away — the marker on a hole, the row in
  your hand blank, and two names printed over each other. The place a row left
  should read as `waiting`; that is what an empty place is called here.
- **A test that deletes every row of a collection is app-global.** A spec that
  read all of `cheat_sheets` and deleted the lot pulled the sheet out from under
  whichever sibling spec was mid-test, because `tests/e2e` runs `fullyParallel`.
  Scope destructive fixtures to the league or member under test — the same trap
  as `sweepOnce` above.
- **One PocketBase client per page, shared.** Each live surface used to create
  its own in its own effect, which was fine while there was only ever one. Add a
  second and the *first* one breaks: `await pb.realtime.subscribe(...)` **never
  resolves and never throws**, so the room silently stops hearing picks and
  pauses — the regression 2.6 exists to prevent, reintroduced by putting chat
  beside it. Each client opens its own `EventSource` and a browser allows only a
  handful per origin; in dev, where StrictMode mounts every effect twice, the
  budget is gone before the second surface asks. Use `src/lib/pb/browser.ts`,
  and respect its two rules: never call `pb.realtime.unsubscribe()` in cleanup
  (it closes the shared connection and deafens everything else — unsubscribe
  only your own topics), and never assign `pb.realtime.onDisconnect` (one slot,
  last writer wins; use `onConnectionLost`). The default `LocalAuthStore` is a
  second trap behind the first: it persists to one key and reconnects realtime
  when it changes, so two instances fight over it. The shared client uses an
  in-memory store.
- **A realtime subscription needs its own `expand`.** `getFullList({expand})`
  expands; the SSE payload does not unless the `subscribe` options say so. Chat
  rendered every *server-loaded* message with its author's team name and every
  message that *arrived* as "A member", including your own the moment you sent
  it. The two surfaces disagreed and only a two-device spec could see it.
- **A list seeded from a prop must follow the prop.** `useState(initial)`
  initialises once, and a subscription connects asynchronously — so anything
  that happens between mount and `PB_CONNECT` is never delivered (realtime does
  not replay) and, with the list frozen, never recovered. Every write here calls
  `revalidatePath`, so merging the server's re-render back in closes that window
  with no special case. Merge by id rather than replace, or a local echo is lost
  while the server render is in flight.
- **Removing a surface breaks the specs that used it as a lens.** The pick
  ticker was how a dozen specs across four files observed "a pick landed" and
  "the room updated over SSE". Deleting it failed 40 tests that were not about
  the ticker at all. The board (`[data-board-slot][data-state="filled"]`) is the
  durable count and the chat transcript is the durable *sentence* — and note the
  board's cell **truncates** a long player name where the announcement carries it
  in full, so translate a name assertion to the transcript, not the board.
- **A test fixture that fakes a display name will hide a real defect.** The
  `commitPick` fixtures passed `say: {teamName: "Fixture FC", playerName:
  "Fixture Player"}`, which made the one spec that checks a pick arriving from
  another device by name assert against a placeholder. Fixtures should read the
  names the way the product does.
- **A scrolling region with no focusable children is keyboard-unreachable.**
  It needs `tabIndex={0}`, `role="region"` and an `aria-label` — WCAG 2.1.1. The
  board's scrollport was fixed for this in 3.1 and league chat shipped with the
  identical defect in 3.5, passing in Chromium both times because a mouse wheel
  does not care. If you build a `overflow-y-auto` box, those three lines are
  part of it.
- **`overflow-y-auto` makes `overflow-x` compute to `auto`.** So an unbroken
  token — a pasted URL — silently pushes the content wide and the box becomes
  horizontally scrollable instead of wrapping: measured at **526px hidden**
  inside a 350px panel. Long *prose* wraps fine, so this only shows up with a
  URL. `break-words` on any element that renders text somebody pasted.
- **Only one bare `getByRole("status")` can exist per page.** Adding a second
  polite live region broke a pool spec by strict-mode violation. Two regions is
  usually correct — one for what a list did, one for what the draft did — but
  give each a `data-testid` and address it by name.
- **A live region is a channel, not a record.** It holds whatever was last worth
  saying and goes quiet otherwise, so do not assert that an old announcement
  persists. And keep announcements *only* in it: 3.3's critique found the pool's
  region narrating a rebuilt row on every keystroke, which queued eleven
  sentences about players nobody had navigated to.
- **A rate limit will refuse an undo.** Putting back something you just deleted
  happens inside the gap by definition, so a restore has to be exempt. Found by
  the spec written for the undo itself, not by using it.
- **Wait for a subscription before writing behind the page's back.** Realtime
  does not replay, so a record created before the first `PB_CONNECT` is simply
  missed — and a direct database write does not `revalidatePath`, so nothing
  re-renders to heal it. Expose the fact (`data-live`) and wait for it, the way
  the board exposes `data-advanced`. Never wait for a duration.
- **A confirmation on the same control it confirms is not one.** A tap that
  arms and a second tap on the *same* button means a fast double-tap arms and
  commits inside 200ms — so the guard catches a stray single tap and misses the
  fat-finger gesture it was built for. Put the confirming control somewhere the
  gesture cannot reach: 3.7 puts it in the sticky clock band, 3.4b put the
  sheet's verbs in a bar. Both arrived at it independently.
- **`useActionState` keeps the previous result across the next interaction.** So
  `{ ok: true }` cannot answer "did *this* one succeed" — a surface that disarms
  on success will disarm a freshly armed row the moment the effect happens to
  re-run. Return the id of the thing that succeeded and compare it.
- **A refusal must not be rendered by something the refusal destroys.** Every
  refusal here revalidates the room, so a stale tab's refused pick arrives
  *with* a re-render that flips the clock band to `paused` — and a correction
  rendered only inside that branch was unmounted in the same breath as it was
  produced. Render the explanation outside whatever the answer might change.
- **Browsers will not play a sound a user did not ask for.** An `AudioContext`
  created outside a gesture starts suspended, so unlock it on the first
  `pointerdown`/`keydown` and `resume()` inside that handler. If the cue is
  enabled and the unlock never happened, *say so* — a promised sound that
  silently does not arrive is worse than one somebody knew was off. And
  `navigator.vibrate` does nothing at all on iOS Safari, which has no Vibration
  API, so never let copy promise a buzz.
- **A cue driven by "is it my turn now" fires on every re-render.** The room
  re-renders on all ~156 picks of a draft. Fire on the *transition* instead,
  remembering what you last fired for — and remember it even when you stay
  silent, or the flood comes back. Let a preference govern the noise but never
  the announcement: an accessibility commitment is not a setting.
- **Changing one interaction breaks every spec that used it.** Turning a pick
  from one tap into two touched 25 call sites across five spec files, none of
  which went through a helper. They do now (`draftPlayer`), and a spec whose
  subject is a *refusal* needs `submitPick`, which does not wait for the
  confirm control to vanish — because a refused pick deliberately keeps it.
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
