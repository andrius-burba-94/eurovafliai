---
name: pocketbase-patterns
description: PocketBase rules for this repo — quirks of PB 0.25+ through 0.39, the no-transactions defense (validate-then-write + unique indexes + idempotent repair), migration-file discipline, filter/sort/auth-rule syntax, localhost binding, and the shared browser realtime client. Use when writing or reviewing anything that touches PocketBase — collections, migrations, filters, API rules, server actions that read or write PB, realtime subscriptions, or the pb/ directory.
paths:
  - "src/lib/pb/**"
  - "pb/**"
  - "src/lib/leagues/**"
  - "src/lib/chat/store.ts"
  - "src/lib/drafts/**"
  - "src/lib/sheets/store.ts"
  - "src/lib/stats/store.ts"
  - "src/lib/memberships/**"
  - "src/lib/rosters/apply.ts"
  - "src/lib/rosters/diff.ts"
  - "src/lib/rosters/rename.ts"
  - "src/lib/mapping/**"
  - "src/app/players/mapping/**"
  - "scripts/pb-*.sh"
  - "scripts/pb-*.mjs"
---

# PocketBase patterns

Hard-won rules. Fresh code gets these wrong by default; a review that misses
one of them is not a review.

## Quirks (PB 0.25+, verified through 0.39)

- Superuser auth endpoint is `/_superusers`, **not** `/admins`.
- Collection schemas use `fields`, **not** `schema`.
- Filter strings need **single quotes** around values:
  `filter = "league = 'abc123'"`. Double quotes fail.
- Every client fetch passes `requestKey: null`, or React StrictMode
  auto-cancels the duplicate request and you debug a phantom.
- Base collections do **not** get `created`/`updated` automatically. Add
  explicit autodate fields in the migration whenever you need them.
- Sort by `-id` for collections without a created-based index. Ids are
  monotonic enough for "newest first".
- API rule syntax is `@request.auth.role`, **not**
  `@request.auth.record.role` (changed in 0.28).
- Auth collections need an explicit `authRule` — `'id != ""'` for
  "any verified account may authenticate".
- **An empty rule (`""`) means *anyone*; `null` means superusers only.** They
  look interchangeable in a JSON dump and are opposites. A fresh auth collection
  ships `createRule: ""`, i.e. public sign-up is open until you close it.
- **`@request.context` distinguishes how a request arrived** — `default`,
  `realtime`, `protectedFile`, `oauth2`. It exists because OAuth2 sign-in
  creates its `users` record through an ordinary internal record-create that
  **is** subject to `createRule`. So the way to close public sign-up on an
  invite-only app without locking out first-time Google users is
  `createRule = '@request.context = "oauth2"'` — not `null`, which would let
  existing members in and refuse every new one. (Eurovafliai `users`; see
  `pb/pb_migrations/1788124900_close_public_signup.js`.) This is not folklore:
  `npm run pb:verify:oauth2` drives PocketBase's real OAuth2 path against a
  local OIDC issuer and asserts that the `oauth2` rule admits a never-seen
  identity while `null` refuses it.
- **Turning `passwordAuth` off breaks anything that calls `authWithPassword`.**
  To act as a real user in a script or test, have a superuser call
  `impersonate(recordId, duration)` — it returns a client already carrying that
  user's token. `password` stays a required *field* on the record either way.
- `username` is a custom field, not built-in.
- Unset numbers are stored as `0`, never `null` → **never put a unique index
  on a numeric field alone** (false conflicts). Composite indexes that include
  a relation are fine, which is exactly what `picks` uses.
- Never `required: true` on a number field that can legitimately be `0`. The
  required check is a truthy test that runs before type-aware validation, so
  `0` fails as "Cannot be blank".
- **A required non-cascade relation blocks a *direct* delete but not a cascading
  one.** Deleting a `players` or `league_members` record that a `picks` row
  points at comes back `400 … Make sure that the record is not part of a
  required relation reference` — which is what `picks.member`/`picks.player`
  carrying `cascadeDelete: false` is *for*: a membership must not vanish out
  from under a board. But deleting the `leagues` record above them succeeds:
  PocketBase walks the cascade tree (league → drafts → picks, league → members)
  and gets there in an order that works. Both halves measured against 0.39.11,
  2026-09-03 — the second one is why `deleteLeague` still deletes drafts first
  rather than leaning on an internal ordering nothing here pins.

## No transactions — the three-layer defense

PocketBase has **no DB transactions**. Every multi-record write needs all three
layers, and the PR must state its failure-recovery story.

1. **Validate-then-write.** Read and check everything the operation depends on
   (existence, ownership, legality, availability) *before* the first write.
2. **Unique indexes as the physical backstop.** Validation can be raced;
   an index cannot. `picks` carries `unique(draft, overall_no)` and
   `unique(draft, player)` so two simultaneous requests cannot produce a double
   pick even if both pass validation.
3. **Idempotent repair.** Write in an order where a crash between writes leaves
   a *detectable, repairable* state — never a corrupt one. For picks the order
   is **create the pick first, advance the draft second**; "pick exists but
   draft not advanced" is then detectable and both `makePick` and the worker
   repair it.

When you add a multi-write action, answer in the PR: what if write 1 lands and
write 2 fails? What repairs it? Which index backs it up?

## Who writes what

- **Writes go through Next server actions** using a superuser PB client over
  localhost. Clients request actions; they never write engine state.
- **Reads use the user's token**, so PB API rules apply as defense-in-depth.
- Engine-owned collections (`drafts`, `picks`, `player_game_stats`,
  `standings_snapshots`, …) are **superuser-write-only**; members get read rules
  scoped to their league.
- `chat_messages` writes go through a **server action** (blueprint D11 / slice
  3.5 withdrew the client-direct exception). The payload still arrives over
  SSE; latency lives on the read side.

## Schema as code

Schema lives in **`pb/pb_migrations/`**, committed, applied on boot. Not in an
exported `schema.json`, and not hand-clicked in the admin UI on the VPS.

- Every collection or index change is a migration file in the same PR as the
  code that depends on it.
- Migrations are append-only; fix a mistake with a new migration.
- Never let production schema drift from the committed files.
- Start every migration with a short header that states:
  1. the slice and purpose;
  2. collections, rules and indexes affected;
  3. why each index or access rule exists;
  4. rollback behavior when it is not a mechanical inverse.
  The header is a schema review aid, not a narration of each line.

## Binding and access

- PB binds to **`127.0.0.1:8095`** — always localhost, never `0.0.0.0`.
- Browsers reach it through the Nginx `/pb/` proxy; Next and the worker talk to
  `http://127.0.0.1:8095` directly.
- The admin UI (`/pb/_/`) is blocked publicly. Reach it via SSH tunnel.

## Realtime

- Realtime is **SSE**. Nginx must have `proxy_buffering off`, `Connection ''`,
  HTTP/1.1 and a long `proxy_read_timeout`, and must forward `Authorization`.
  See the `vps-deploy` skill.
- Subscribe with the user's token (pass it into client components as an
  `authToken` prop; do not re-authenticate in the browser).
- **A live surface uses `useLiveSubscription`** (`src/lib/pb/use-live.ts`)
  and supplies only its own topics. The hook owns the shared client, the
  connect grace, `PB_CONNECT`, connection-loss and token-refusal handling,
  and tears down only the topics it opened. Do not hand-roll the effect.
- Assume drops. Show a "reconnecting" state (`connected` from the hook); the
  SDK re-subscribes. On a reconnect, re-read or re-render — the gap was never
  delivered to anyone.
- Subscription failures go through `reportRealtimeError`: 401/403 is a
  terminal token refusal and navigates to sign-in; a status-0/network failure
  is transport loss and keeps the last good UI while the SDK retries. Never
  retry a refused token forever.

## Known gotchas

- **One PocketBase client per page, shared.** Each live surface used to create
  its own in its own effect. A second client makes the *first* hang:
  `await pb.realtime.subscribe(...)` never resolves and never throws. Use
  `src/lib/pb/browser.ts`. Never call `pb.realtime.unsubscribe()` in cleanup
  (it closes the shared connection — unsubscribe only your own topics). Never
  assign `pb.realtime.onDisconnect` (one slot; use `onConnectionLost`). The
  shared client uses an in-memory auth store so two instances cannot fight over
  `LocalAuthStore`.
- **A realtime subscription needs its own `expand`.** `getFullList({expand})`
  expands; the SSE payload does not unless `subscribe` options say so.
- **Next memoizes identical GET fetches within one render pass**, and the
  PocketBase SDK uses `fetch`. Read → repair → read-again returns the first
  read's stale result. Repair before the read (`src/lib/leagues/queries.ts`).
- **`readPicks` returns the engine's pick shape**, not PocketBase's:
  `playerId` / `memberId`, not `player` / `member`. Reading `.player` is
  `undefined` and will re-pick a taken player (`"raced"` after the first commit).
- **A list seeded from a prop must follow the prop.** `useState(initial)`
  initialises once; realtime does not replay. Merge the server re-render by id
  (`revalidatePath` is how writes close the gap).
- **Wait for a subscription before writing behind the page's back.** Realtime
  does not replay, and a direct database write does not `revalidatePath`. Expose
  `data-live` (or `data-advanced`) and wait for it — never wait for a duration.
- **`localhost` and `127.0.0.1` are not interchangeable.** App origin (OAuth
  redirect) is `http://localhost:3007`. PocketBase URLs stay on `127.0.0.1`
  (SDK fails on IPv6-first `localhost`). Backwards → `redirect_uri_mismatch` or
  `ECONNREFUSED ::1`.
- **PocketBase `checksums.txt` is combined** for the whole release;
  `pb-download.sh` verifies only our archive's line.
- **A sync that suspects a rename writes neither half.** Before 4.2, a stored
  player the feed had re-registered under a passport name produced an add and
  a departure for the same human. Box scores attach by `person_code`, so the
  points would land on the new row while a pick pointed at the old one.
  `diffRosters` quarantines the likely pairs; `/players/mapping` resolves
  them. A merge keeps the stored player's **id**. The confident rule is token
  containment, not a fuse threshold — fuse's scores overlap on real pairs and
  namesakes.
