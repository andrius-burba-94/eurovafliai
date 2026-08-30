---
name: pocketbase-patterns
description: PocketBase rules for this repo — quirks of PB 0.25+ through 0.39, the no-transactions defense (validate-then-write + unique indexes + idempotent repair), migration-file discipline, filter/sort/auth-rule syntax, and localhost binding. Use when writing or reviewing anything that touches PocketBase — collections, migrations, filters, API rules, server actions that read or write PB, realtime subscriptions, or the pb/ directory.
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
  `pb/pb_migrations/1788124900_close_public_signup.js`.)
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
- One documented exception: `chat_messages` **create** may be client-direct for
  latency, rule-guarded by `author = @request.auth.id` plus league membership.

## Schema as code

Schema lives in **`pb/pb_migrations/`**, committed, applied on boot. Not in an
exported `schema.json`, and not hand-clicked in the admin UI on the VPS.

- Every collection or index change is a migration file in the same PR as the
  code that depends on it.
- Migrations are append-only; fix a mistake with a new migration.
- Never let production schema drift from the committed files.

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
- Assume drops. Show a "reconnecting" state; the SDK re-subscribes.
