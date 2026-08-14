# Eurovafliai — Euroleague Fantasy Draft Platform

**Blueprint & phased build plan** · `eurovafliai.labrium.online` · target: draft night before Euroleague 2026–27 Round 1 (20 teams, 38 regular-season rounds; season starts ~late September 2026)

Built from scratch by AI agents (Claude Code CLI primary), reviewed and merged by Andrius. This document is the master plan; each phase becomes a grilling session + spec + tickets in the repo itself.

---

## 1. Product summary

A private, invite-based fantasy draft platform for a friend group. One commissioner (admin) configures a league, friends join a lobby, the commissioner rolls draft order and runs a **live, real-time draft** that every participant watches update simultaneously on their own device. After the draft, the app tracks real Euroleague player performance (PIR + fantasy points) daily, computes league standings, and tracks the point impact of every trade/signing.

**Non-goals (v1):** public signup, multiple concurrent public leagues at scale, native apps, live in-game scoring. Scale target is ~10 concurrent users — design for correctness and clarity, not horizontal scale.

**Roster template:** 13 players per team — 5 Guards, 5 Forwards, 3 Centers → 13 rounds in a standard draft.

---

## 2. Decision log (locked 2026-08-12)

| # | Decision | Locked value |
|---|----------|--------------|
| D1 | Framework | **Next.js 16 / React 19 / Tailwind v4 / TS strict / Node 24** — matches Inkliuzas/Centfolio so all `.claude/rules`, auth-cookie pattern, and PB learnings transfer. ✔ |
| D2 | Backend | **PocketBase, native binary, pinned version, bound to `127.0.0.1:8095`** (verify port free on VPS). ✔ |
| D3 | Name / port / subdomain | **Eurovafliai** · Next on **3007** (verify vs `pm2 ls` / `ss -tlnp`) · `eurovafliai.labrium.online`. ✔ |
| D4 | Scoring | **Official EuroLeague Fantasy Challenge player formula** (verified against the official rulebook): +1 per point, rebound, assist, steal, block made, foul drawn; −1 per turnover, block suffered, foul committed, missed FG, missed FT; then **+10% team-win bonus** on that round's score. The base sum is *exactly PIR* — so the "PIR fallback" is automatic: `fantasy_pts = PIR × 1.1 on a win, PIR otherwise`. Store `pir` as integer and `fantasy_pts` as **integer tenths** (the 10% bonus produces .5s — same no-float-drift rule as the Centfolio money lib). Formula weights still live in league settings JSON so the league can tweak later. Ignore the official game's *league mechanics* (captain 2×, bench 50%, coach scoring) — those belong to their game mode, not a draft league. ✔ |
| D5 | Stats source | **Primary:** automated nightly fetch from the Euroleague public API via the `aimon7/euroleague-api` TS SDK (or direct feeds endpoints); PIR + fantasy points computed from box score + game result — the D4 formula needs nothing the box score doesn't have, so **no scraping at all**. **Fallback:** admin CSV upload. ✔ |
| D6 | Auction format | **Cut.** (For reference: an auction draft replaces turn order with budgets — players are nominated and bid on, roster built by spending a cap. Fun, but by far the most complex format to build.) Not wanted season one → removed from scope; the engine's format abstraction keeps the door open if the league ever changes its mind. ✔ |
| D7 | Issue tracker for skills | **GitHub Issues** (matches PR discipline + `gh` CLI). ✔ |
| D8 | Player data | **Dual-source, one canonical table, commissioner-controlled authority.** Two equal ingestion paths — Euroleague API sync (season `E2026`; 20 teams / 38 rounds confirmed, provisional rosters already published) and CSV upload — feed the **same** `players` table through one shared pipeline with a diff preview. An app-level `roster_authority: api \| csv` switch decides which source is allowed to write; the other still runs but in report-only mode (shows what it *would* change). Per-player `manual_lock` protects admin corrections from both sources. Typical season flow: API-authority all summer → confirmed-roster CSV uploaded near draft night → flip authority to `csv` → flip back (or stay) once the season is running. Every import from either source is stored as a `roster_imports` batch — separate, auditable, re-applicable. ✔ |
| D9 | Participants | 8–10 expected, 12 max. At 12 the draft consumes 156 of ~350+ pool players — comfortably deep; at 8 the free-agent pool is rich, which makes Phase 5 add/drops more interesting. No structural impact. ✔ |

---

## 3. Architecture overview

```
                       Browser (PC / mobile)
                       │  HTTPS (Nginx + Certbot)
        ┌──────────────┴───────────────────────────┐
        │                                          │
   Next.js 16 app (PM2, :3007)              /pb/* proxied →
   - RSC pages, Server Actions              PocketBase (systemd, 127.0.0.1:8095)
   - session cookies (httpOnly)             - collections + auth (Google OAuth2)
   - all WRITES go through here             - realtime SSE → browsers subscribe
        │                                          ▲
        │  superuser client (localhost)            │
        └───────────────┬──────────────────────────┘
                        │
              Worker process (PM2, same repo)
              - pick-timer enforcement + auto-draft
              - nightly stats fetch + standings recompute
```

### Core principles

1. **Server-authoritative draft state.** Clients only *render* state and *request* actions. The `drafts` record is the single source of truth: current pick index, deadline timestamp, status. Clients never decide whose turn it is.
2. **Realtime = PocketBase SSE subscriptions** (same as Eurovision2026 reveal). Browser PB client points at `https://<sub>/pb/`, subscribes to `drafts`, `picks`, `chat_messages` with the user's token (your established `authToken` prop pattern). Any state change any client causes is pushed to all clients.
3. **No transactions in PB → three-layer defense** for the pick race:
   - Server action validates (is it your turn? player available? roster slot legal?) — validate-then-write.
   - **Unique indexes** `(draft, overall_no)` and `(draft, player)` on `picks` — the DB physically rejects a double pick even if two requests slip through validation simultaneously.
   - **Idempotent advance**: pick creation and draft-state advance are two writes; the worker (and every `makePick` call) can detect "pick exists but draft not advanced" and repair it. Order: create pick first, advance second.
4. **Writes via server actions with a superuser PB client; reads via user tokens.** PB API rules are defense-in-depth: engine-owned collections (`drafts`, `picks`, `player_game_stats`, …) are superuser-write-only; members get read rules scoped to their league. Exception: `chat_messages` create can be client-direct (rule `author = @request.auth.id && league membership`) for latency.
5. **Time:** the server stores absolute `deadline` timestamps. Clients render a countdown against a clock offset obtained from a tiny `/api/time` endpoint (one fetch at draft-room mount). The **worker** polls active drafts every ~1s and executes auto-pick when `deadline < now` — never trust a client to fire the expiry.
6. **Shared engine library.** All draft logic (order generation, legality, autopick selection, rollback math) is **pure TypeScript in `src/lib/engine/`** with zero PB imports — used by server actions *and* the worker, and unit-tested to death via `/tdd`. This is the highest-value TDD surface in the whole project.

### Auth

- PocketBase Google OAuth2, **manual code flow** (`authWithOAuth2Code`) so the session lands in an **httpOnly cookie** managed by Next server actions — same session/rehydration pattern you settled on for Inkliuzas, just OAuth instead of password.
- Google Cloud OAuth client with two redirect URIs (localhost + production). Use mattpocock's `/wizard` skill to generate the interactive walkthrough for the Google Cloud console steps.
- `React.cache`-wrapped `getSession()` to deduplicate PB roundtrips per request (established pattern).

---

## 4. Data model (PocketBase collections)

All base collections get manual `created`/`updated` autodate fields (PB doesn't add them). Sort by `-id` where no created index exists. Single-quoted filter strings. `requestKey: null` on client fetches.

| Collection | Key fields | Indexes / rules notes |
|---|---|---|
| `users` (auth) | name, avatar | Google OAuth2 enabled; `authRule: 'id != ""'` |
| `leagues` | name, season, commissioner→users, invite_code, settings JSON (scoring weights, roster_template `{G:5,F:5,C:3}`, trade rules), status | unique(invite_code) |
| `league_members` | league, user, team_name, draft_position, autodraft_enabled bool | unique(league,user) |
| `players` | name, name_normalized (diacritics-folded, for search), team_code, team_name, position `G\|F\|C`, status `active\|injured\|doubtful\|left`, person_code (Euroleague external id, nullable), source `api\|csv\|manual`, manual_lock bool, projection fields | unique(person_code) where set |
| `drafts` | league, format `linear\|snake\|snake3rr\|keeper`, status `setup\|rolling\|live\|paused\|complete`, settings JSON (pick_seconds, rounds, order_mode `roll\|manual\|reverse_standings`), order JSON, current_pick, deadline, seed | one active draft per league |
| `picks` | draft, overall_no, round, slot, member, player, is_auto | **unique(draft,overall_no)**, **unique(draft,player)** — the race-condition safety net |
| `cheat_sheets` | member, draft, ranking JSON (ordered player ids), tiers JSON, source `csv\|manual` | unique(member,draft) |
| `chat_messages` | league, author (null = system), body, kind `user\|system` | rate-limit via PB settings; realtime |
| `draft_trade_offers` | draft, from_member, to_member, payload JSON, status | **unique(draft,from_member)** — enforces "one offer per player per draft" |
| `player_game_stats` | player, season, round, game_code, date, min/pts/reb/ast/stl/blk/to/fouls…, **pir**, **fantasy_pts** | unique(player,season,game_code) — idempotent upserts |
| `roster_memberships` | league, member, player, from_date, to_date (null = active), acquired_via `draft\|trade\|signing` | the backbone of trade-impact tracking |
| `transactions` | league, type `trade\|add\|drop`, date, members JSON, players_in/out JSON, note | |
| `standings_snapshots` | league, round, table JSON | powers round-over-round chart |
| `stat_imports` | source `api\|csv`, round, rows, status, log | audit trail for stats ingestion |
| `roster_imports` | source `api\|csv`, applied bool, diff JSON (adds/changes/leaves), rows, log | every roster batch stored separately; apply/re-apply from history |

---

## 5. Draft formats (the "look for more" answer)

| Format | Order behavior | Phase |
|---|---|---|
| **Linear** | Same order every round (1→N, 1→N…) | 2 |
| **Snake** | Reverses each round (1→N, N→1…) | 2 |
| **Third-round reversal (3RR)** | Snake, but round 3 repeats round 2's direction — compensates the last-pick disadvantage | 2 (free once order gen is pure-function + tested) |
| **Auction / salary cap** | Nomination + open bidding with budgets instead of turn order | **Cut** (D6 — league doesn't want it) |
| **Keeper** | Members retain N players season-to-season; kept players consume a draft round or budget | 6 (mostly settings + seeding next season's draft) |
| **Dynasty** | Keeper taken to the extreme (retain whole roster) | note-only; falls out of keeper |
| **Slow / async draft** | Any format with hours-long timers; picks announced in chat | 6 (a settings preset, not new code) |
| **Commissioner/manual mode** | Commissioner enters picks made offline (e.g., drafting in a bar) | 3 (cheap, high real-world value) |

Order generation is one pure function `buildPickOrder(format, memberIds, rounds)` returning `overall_no → member` — TDD it with all formats and odd participant counts.

---

## 6. Phase plan

Each phase = a sequence of vertical slices; each slice = one PR (your granular-commit discipline). Definition of Done for **every UI slice** includes: responsive (mobile-first — draft night will be phones on a couch), reduced-motion respected, empty/error states, `/impeccable` pass where noted.

**Per-slice agent loop (the workflow, use every time):**

```
/grill-with-docs  →  /to-spec  →  /to-tickets  →  /implement (drives /tdd + /code-review)
→ PR → CI (typecheck, lint, vitest, impeccable detect) → [UI slices: /impeccable critique|polish]
→ squash-merge → deploy.sh
```

Every Claude Code prompt starts with "Read CLAUDE.md". One slice per prompt. When a hard bug appears: `/diagnosing-bugs`, and hand over source files immediately rather than blind-fixing.

---

### Phase 0 — Repository bootstrap & foundation (everything from empty directory)

**Goal:** an agent-ready, CI-green, documented repo where `npm run dev` boots Next + PocketBase together.

- **0.1 Repo & runtime.** `git init`; GitHub repo via `gh repo create` (private); branch protection on main, squash-merge only, linear history; PR template. Pin Node 24 (`.nvmrc`, `engines`). `npx create-next-app@latest` — TypeScript, App Router, Tailwind v4, ESLint; TS `strict: true`; Turbopack dev; `dev:clean` script (`rm -rf .next && next dev`).
- **0.2 PocketBase.** `scripts/pb-download.sh` — pinned PB version, linux-amd64 + local arch, verify against the **combined** `checksums.txt` (known quirk). `pb/` dir with `pb_data/` gitignored, `pb_migrations/` **committed** (schema as code — every collection change is a migration file in the PR). npm scripts: `pb:serve` (`--http=127.0.0.1:8095`), `dev` (concurrently: next + pb), `worker:dev`.
- **0.3 Testing & CI.** Vitest (unit; **exclude `tests/e2e/**`** — the Playwright glob collision) + Playwright (E2E, local-first). GitHub Actions: typecheck, lint, vitest on every PR; `npx impeccable detect --json src/` as a non-blocking CI step; auto-deploy on push to main (SSH → `deploy.sh`) added in Phase 1.5.
- **0.4 Skills install.**
  - `claude plugins install mattpocock-skills` (official marketplace, auto-updating) → run `/setup-matt-pocock-skills` once: tracker = **GitHub Issues**, docs location = `docs/`. Note renames vs. your older usage: `/to-prd` → **`/to-spec`**, `/to-issues` → **`/to-tickets`**; new **`/implement`** and **`/wayfinder`** exist.
  - `npx impeccable install` (detects Claude Code + Gemini CLI harnesses) → `/impeccable init` inside the agent: surface = **product** (app UI, data-dense). Writes PRODUCT.md + DESIGN.md. Add the impeccable `.gitignore` block; keep `.impeccable/config.json`, `design.json`, `critique/*.md` tracked.
  - **Custom project skills** (write with the `writing-for-agents` skill as guide), in `.claude/rules/` or as proper skills:
    1. `pocketbase-patterns` — your accumulated PB rules verbatim: v0.25+ breaking changes, `requestKey: null`, single-quote filters, manual autodate fields, `-id` sorting, `authRule 'id != ""'`, v0.28 rule syntax (`@request.auth.role`), **no transactions → validate-then-write + unique-index guards**, 127.0.0.1 binding, migration-file discipline.
    2. `draft-engine-invariants` — the non-negotiables: server-authoritative state, engine lib stays pure (no PB imports), pick-then-advance write order, idempotent repair, never trust client clocks, every format change needs order-generation tests.
    3. `vps-deploy` — runbook skill: deploy.sh flow, PM2 ecosystem, Nginx SSE requirements, systemd for PB, "never patch in production".
  - **Deliberately not installing more public packs** (superpowers, etc.) — skill overload dilutes triggering. mattpocock covers process, impeccable covers design, custom skills cover domain. Revisit only if a gap shows up.
- **0.5 Foundation docs.** CLAUDE.md (points at rules + docs), AGENTS.md, CONTEXT.md (ubiquitous language — seed it: *pick, on the clock, board, radar, pool, cheat sheet, lot, membership, snapshot*), PRODUCT.md/DESIGN.md (from impeccable init), `docs/adr/` (ADR-0001: stack; ADR-0002: PB realtime + worker architecture; ADR-0003: no-transactions mitigations).
- **0.6 Env plumbing.** `.env.example`: `NEXT_PUBLIC_PB_URL`, `PB_INTERNAL_URL`, `PB_SUPERUSER_EMAIL/PASSWORD`, `GOOGLE_CLIENT_ID/SECRET`, `SESSION_COOKIE_NAME`. Small validated config module.

**DoD:** fresh clone → `./scripts/pb-download.sh && npm i && npm run dev` works; trivial PR goes green through CI; `/grill-with-docs` and `/impeccable` respond in Claude Code.

---

### Phase 1 — Walking skeleton: auth, league, lobby, **deployed**

**Goal:** two people on two devices log in with Google, join the same lobby, and see each other appear live — in production. Deploy early; every later phase ships to a real URL.

- **1.1 Schema migrations:** `leagues`, `league_members`; Google OAuth2 config on `users`.
- **1.2 Auth slice:** login page → PB `authWithOAuth2Code` manual flow → httpOnly cookie session; `getSession()` with `React.cache`; logout; route protection. Use `/wizard` to generate the Google Cloud console walkthrough (OAuth client, both redirect URIs).
- **1.3 League & lobby:** commissioner creates league (name, season, roster template); invite by code/link; lobby page with live member list (realtime subscription — first use of the `authToken` pattern); commissioner can set team names, kick, mark ready.
- **1.4 Design foundation:** app shell, nav, typography/color tokens per DESIGN.md. First `/impeccable critique` snapshot. Direction: **broadcast scoreboard restraint** — data-dense, calm surfaces, one accent doing real work (on-the-clock highlights, position colors); no card-in-card, no gradient soup. Motion (Motion lib) reserved for meaningful state changes: the roll, pick landing on the board.
- **1.5 Deploy slice:** VPS provisioning via `/wizard`-generated runbook — PB systemd unit (auto-restart on reboot), PM2 app (`:3007`), Nginx vhost + Certbot, `deploy.sh` (git pull → npm ci → build → migrate → PM2 restart), GH Action auto-deploy on main. **Nginx must proxy `/pb/` with SSE-safe config** (see §8) and block `/pb/_/` (PB admin UI) publicly.

**DoD:** phone + PC, two Google accounts, live lobby on the production subdomain.

---

### Phase 2 — Draft engine v1 (linear + snake + 3RR) — the TDD phase

**Goal:** a complete, correct, rollback-capable live draft with a minimal UI. Correctness before beauty.

- **2.1 Roster ingestion (dual-source, per D8).** One shared pipeline, two front doors:
  - **Normalize → diff → apply.** Both the API sync (`scripts/sync-rosters.ts`, season `E2026` club rosters → names, `person_code`s, positions) and the admin CSV upload (`name,team_code,position[,person_code,status]`) produce the same normalized row shape. The pipeline diffs against current `players` and shows the commissioner a preview — *adds / changes / players leaving* — before anything is written. Every batch (applied or not) is stored in `roster_imports`.
  - **Why one canonical `players` table, not two switchable sets:** picks, cheat sheets, roster memberships, and game stats all reference player IDs. Two parallel sets would orphan those references the moment you "switch" — so the sources are stored separately as import batches, but they converge into one table.
  - **Authority switch.** `roster_authority: api | csv` — only the authoritative source may apply; the other runs report-only. Your flow: API all summer → upload the confirmed CSV near draft night, flip authority to `csv` → API roster sync becomes a drift report (stats sync in Phase 4 is unaffected by this switch).
  - **Matching & merge rules (the part that prevents data loss):** match by `person_code` when present, else by `name_normalized` + team. A CSV overwrite **never nulls an existing `person_code`** — codes are preserved through any overwrite so stats joins survive. `manual_lock`ed players are untouchable by both sources. Position mapping: "Guard-Forward"-style listings map to a single `G|F|C` bucket by rule, admin-overridable (override sets `manual_lock` on that field's row).
  - Players who disappear from the authoritative source → status `left` (never deleted; history references them). Diacritics-folded `name_normalized` generated on every ingest — Valančiūnas must be findable as "valanciunas". Basic players list page with source/lock badges.
  - **Operational rule:** re-sync on demand through September; final authoritative snapshot (API or your CSV) within 24h of draft night.
- **2.2 Engine library (pure TS, `/tdd` mandatory).** `buildPickOrder` (linear/snake/3RR, odd member counts), `whoIsOnClock`, `isLegalPick` (availability + positional caps vs `{G:5,F:5,C:3}` — including the endgame case "only C slots left → only Cs legal"), `selectAutoPick` (cheat sheet first, else projection rank, always legality-filtered), `computeRollback(targetPickNo)`. No PB imports. This module is the heart of the app — over-test it.
- **2.3 Draft setup & order determination.** Commissioner settings form (format, seconds per pick, autodraft toggles); participant count = joined members. **Three order modes** (`drafts.settings.order_mode`): **roll** — seeded shuffle (`crypto`), seed stored on `drafts`, revealed live to all clients one slot at a time as an animated event (Eurovision2026 reveal patterns — remember the `flushSync`-in-effect gotcha: defer via `setTimeout(0)`); **manual** — commissioner drag-orders members (side bets, coin flips at the bar, whatever the league decided offline); **reverse_standings** — season 2+ with keeper leagues: order auto-derived from last season's final `standings_snapshots`, worst first. Order mode is orthogonal to format — any mode feeds `buildPickOrder` for linear/snake/3RR alike.
- **2.4 Pick pipeline.** `drafts` + `picks` migrations with the two unique indexes; `makePick` server action (validate → create pick → advance draft: increment `current_pick`, set new `deadline`, or mark `complete`); pause/resume; **rollback**: commissioner picks a pick number, engine computes the revert, picks with `overall_no ≥ target` deleted, draft re-pointed, status → paused, system chat message. Undo must survive snake-direction math — tested in 2.2.
- **2.5 Worker.** `src/worker/index.ts` under PM2 (ecosystem file gains a second app). Loop (~1s): find `live` drafts with `deadline < now` → run `selectAutoPick` → same pick pipeline (`is_auto: true`) → also repair any pick-created-but-not-advanced state. `/api/time` endpoint for client clock offset.
- **2.6 Minimal draft room.** On-the-clock banner + countdown (offset-corrected, display only), simple pick list, "make pick" from a plain player list, realtime subscription wiring, connection-lost indicator (SSE drop → show "reconnecting", PB SDK auto-resubscribes).

**DoD:** full 13-round mock draft completed on phone + PC with one member on autodraft throughout; a mid-draft rollback executed and the draft finishes clean; engine test suite covers every format × edge case.

---

### Phase 3 — Draft-day experience (the flagship UI)

**Goal:** the actual draft night product. Everything here is UI-heavy → `/impeccable critique` per slice, `polish` + `audit` at phase end.

- **3.1 Draft board.** Grid: rounds × teams, cells colored by position, auto-scroll to current pick, recent-pick animation; mobile: condensed ticker + expandable board.
- **3.2 Live Roster Radar.** Per-member matrix of 5G/5F/3C slots filling in real time; own-team panel highlights remaining needs ("needs: 1 C, 2 F"); legality preview (players you *can't* legally pick are visually muted in the pool).
- **3.3 Player pool: filters + search.** Filters: position, team, injury status (admin-editable player flag), projected points, custom tier (from user's cheat sheet), **hide drafted** (default on). Search: fuse.js fuzzy over the pool (~350 players — client-side, instant) with diacritic folding and typo tolerance; keyboard-first (type → arrow → enter to queue pick). This satisfies "predictive text + auto-correct" without any server round-trips.
- **3.4 Cheat sheets.** CSV upload (rank[,tier],player name — fuzzy-matched to pool with a confirm step for ambiguous names) + dnd-kit drag-to-reorder + tier breaks; editable before *and during* the draft in a sidebar; drives autodraft; "best available from my sheet" always pinned.
- **3.5 League chat + draft trade offers.** Chat panel (realtime; system messages for picks, roll results, rollbacks, pauses); **one trade offer per member per draft** (unique index enforced): offer targets picks/players, is announced as a system message **before the offerer's next pick**, recipient accepts/declines; accepted swaps are executed by the engine (another rollback-adjacent tested path).
- **3.6 Commissioner console.** Pause/resume, rollback UI, toggle autodraft for absent members, adjust timer mid-draft, **manual pick entry** (commissioner mode / offline draft support).
- **3.7 Draft-day polish.** Pick-confirmation (no fat-finger picks on mobile), sound/vibration cues on "you're on the clock", toasts, `/impeccable polish` + `/impeccable audit` + `/impeccable harden` (empty states, overflow, error paths), responsive QA on real devices.

**DoD:** a rehearsal draft night with 3+ friends, mixed devices, no commissioner intervention needed except by choice.

---

### Phase 4 — Player stats, projections, standings

**Goal:** the app becomes useful *between* game days without manual work.

- **4.1 Stats schema + scoring engine + CSV import (MVP path).** `player_game_stats`, `stat_imports`; admin upload page with parse preview, per-row validation, idempotent upsert (unique player+season+game). **Scoring is a pure, TDD'd function** `scoreGame(boxScore, teamWon, weights)`: base = PIR components (+pts +reb +ast +stl +blk_for +fouls_drawn −to −blk_against −fouls_committed −missed_fg −missed_ft), then the official +10% team-win bonus; default weights = the official EuroLeague Fantasy Challenge rulebook, stored in league settings. `fantasy_pts` persisted as integer tenths. One documented edge case: negative base score on a win — apply the ×1.1 multiplier uniformly and reconcile against the official game's handling after Round 1 (weights/bonus behavior is config, so correcting it is a settings change + recompute, not a migration).
- **4.2 Player mapping (now a light verification pass).** Because Phase 2.1 syncs `person_code` from the API on day one, box-score joins are exact by ID. What remains: a small reconciliation view for edge cases — mid-season signings synced late, CSV-imported players without codes, or API oddities — with auto-suggest by normalized name + team and manual confirm.
- **4.3 Automated fetcher (worker cron).** Nightly on game days: schedule check → fetch player boxscores for finished games via the `aimon7/euroleague-api` TS SDK (Zod-validated; same feeds as the established Python `euroleague-api` package) → upsert stats → log to `stat_imports`. CSV path remains as override/fallback. Retry + alert (system chat message to commissioner league) on failure.
- **4.4 Projections.** Rolling last-5 and season averages materialized onto `players` after each ingest → powers the "projected points" filter and autodraft rank for members without cheat sheets.
- **4.5 Standings.** Recompute after every ingest from `roster_memberships` × `player_game_stats` (membership date windows — see Phase 5); write `standings_snapshots` per round; standings page with total + round-over-round chart; player profile pages (game log, PIR/fantasy trend).

**DoD:** after a real round (or a replayed 2025–26 round as test data), standings update overnight with zero manual input.

---

### Phase 5 — Season mode: rosters, trades, impact tracking

**Goal:** the Valančiūnas → Motiejūnas feature.

- **5.1 Membership backbone.** On draft completion, materialize `roster_memberships` (from_date = draft date, via `draft`). Team pages showing current roster + radar.
- **5.2 Transactions.** Trade builder (two members, players either side, optional commissioner approval per league settings) and free-agent add/drop — all validated against the positional template, executed validate-then-write: close memberships (`to_date`), open new ones, write `transactions` record, system chat message.
- **5.3 Impact tracking.** Per transaction: cumulative fantasy points / PIR of players-in vs players-out **since the transaction date**, with a running delta ("this trade is +37.5 pts so far") and a per-round sparkline; team page lists all transactions with live deltas; "what if I'd kept him" is the same query, framed. Falls straight out of membership windows — no special data needed.
- **5.4 Weekly recap page.** Round results per team, best pick of the round, biggest trade delta movement.

**DoD:** execute a test trade, replay a round of stats, verify the delta matches a hand calculation.

---

### Phase 6 — Optional formats (post-launch luxury; auction cut per D6)

- **6.1 Keeper.** League setting: N keepers; pre-draft keeper selection UI; kept players pre-consume the owner's pick in a chosen round; next-season league cloning carries keepers. Realistically a summer-2027 feature — build it when season two is on the horizon, informed by a season of real usage.
- **6.2 Slow draft preset.** Long timers, autodraft default off, "you're up" surfaced via chat + (optional) email through your existing mail setup. Mostly a settings preset over the Phase 2 engine.

---

### Phase 7 — AI features (Gemini 2.5 Flash)

Hard rule: **nothing latency-critical or fairness-critical depends on an LLM.** Auto-draft and pick legality stay deterministic (Phase 2). AI is commentary and analysis:

- **7.1 Pick advisor.** Deterministic shortlist (best available × roster needs × your cheat sheet) + one-line Gemini rationale per candidate. Cached per pick state, never blocking.
- **7.2 Trade analyzer.** For a proposed trade: stats-based comparison (deterministic) + Gemini narrative verdict. Reused in Phase 5 trade builder and Phase 3 draft offers.
- **7.3 Draft recap.** Post-draft Gemini-written article: grades per team, steals, reaches — pure fun, zero risk, high league-chat value.
- **7.4 (Optional) chat pundit.** A system persona that posts one snarky observation per round of picks. Rate-limited, toggleable, off by default.

---

### Phase 8 — Hardening & ops polish

- `/impeccable harden` + `onboard` (first-run flows, empty league states) + `adapt` (device pass) + final `audit`.
- Accessibility pass (focus order in the draft room, announcements via live regions for "you're on the clock").
- Nightly `pb_data` backup (cron: sqlite-safe copy via `pb` backup or stop-copy-start window / PB backup API) + retention; restore drill once.
- Log hygiene: PM2 log rotation; worker failure alerts to system chat.
- Load sanity check: one Playwright script simulating 10 clients through a fast mock draft.

---

## 7. Feature coverage matrix (every requested item → where it lands)

| Requested feature | Phase / slice |
|---|---|
| Lobby, participants count, admin-controlled settings | 1.3, 2.3 |
| Roster upload via CSV overwriting/coexisting with API sync (authority switch) | 2.1 |
| Roll for draft order (live animated) + manual + reverse-standings order modes | 2.3 |
| Draft formats: linear, snake | 2.2–2.4 |
| Draft formats: 3RR (bonus), keeper, slow, commissioner/manual — auction cut per D6 | 2.2 (3RR), 6.1, 6.2, 3.6 |
| Live same-state-on-every-device draft | Architecture §3 + 2.6 + 3.1 |
| Customizable draft settings | 2.3 |
| Auto-draft | 2.2 + 2.5 |
| AI bot assistance (feature menu decided) | 7.1–7.4 |
| Google OAuth | 1.2 |
| PIR + fantasy point tracking (upload **and** automated) | 4.1 (upload), 4.3 (automated) |
| Post-draft team editing | 5.2 |
| Trade impact tracking (Valančiūnas→Motiejūnas delta) | 5.3 |
| Sleek minimal data-first design | 1.4 + impeccable throughout |
| Advanced filters (position/team/injury/projection/tiers) | 3.3, 4.4 |
| Robust search (predictive, typo-tolerant, diacritics) | 3.3 |
| Standings updating daily, automated | 4.5 + 4.3 |
| Responsive everywhere | DoD on every UI slice + 8 |
| Cheat sheets: upload, drag-drop, editable pre/during draft | 3.4 |
| Live Roster Radar (5G/5F/3C matrix) | 3.2 |
| League chat + one announced trade offer per member during draft | 3.5 |
| Draft rollback / reset without restart | 2.4 + 3.6 |

---

## 8. Deployment & ops specifics (VPS)

- **Processes:** PM2 `ecosystem.config.js` with two apps — `eurovafliai-web` (:3007) and `eurovafliai-worker`. PocketBase under **systemd** (auto-restart on reboot), `--http=127.0.0.1:8095`.
- **Nginx — the SSE part is the one new gotcha for you.** PB realtime is Server-Sent Events; default proxy buffering kills it:

```nginx
location /pb/ {
    proxy_pass http://127.0.0.1:8095/;
    proxy_http_version 1.1;
    proxy_set_header Connection '';
    proxy_set_header Authorization $http_authorization;  # known pitfall
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 360s;
}
location /pb/_/ { return 403; }   # PB admin UI never public; use SSH tunnel when needed
```

- Client PB base URL = `https://<subdomain>/pb`; server-side Next + worker talk to `http://127.0.0.1:8095` directly.
- `deploy.sh`: git pull → `npm ci` → `npm run build` → run PB migrations → `pm2 restart eurovafliai-web eurovafliai-worker`. GH Action triggers it on main. Never patch in production.
- Watch the usual vhost pitfalls from your list: no placeholder domains, no duplicate gzip directives, correct port.

## 9. Risk register / known gotchas (pre-loaded into custom skills)

1. **PB no transactions** — unique indexes + validate-then-write + idempotent repair (§3). Never add a multi-write server action without stating its failure-recovery story in the PR.
2. **Clock skew** — server deadlines + `/api/time` offset; worker enforces expiry.
3. **SSE through Nginx** — §8 config; test realtime *in production* as part of Phase 1.5 DoD.
4. **React 19 resets uncontrolled inputs after server-action transitions** — chat input and pick forms; E2E tests must refill.
5. **Brave hydration mismatch noise** & **stale `.next` cache** — not real bugs; `dev:clean`.
6. **Vitest/Playwright glob collision** — excluded in 0.3.
7. **Diacritics** — `name_normalized` everywhere names are matched (search, CSV import, API mapping).
8. **PB v0.28 rule syntax** (`@request.auth.role`), single-quote filters, `-id` sorting, manual autodate fields, `requestKey: null`.
9. **next.config.ts is fine on Next 16** — the old ts→mjs production gotcha no longer applies.
10. **Draft-night failure mode:** if the worker dies, timers stop enforcing but nothing corrupts — commissioner can manual-pick. PM2 auto-restart + a worker heartbeat surfaced in the commissioner console.
11. **Season deadline:** Phases 0–3 must land before draft night (~mid-September buffer); Phase 4 before Round 1; Phase 5 can trail into October. Phases 6–7 are luxury items — protect the critical path.

## 10. Remaining small calls (everything big is locked in §2)

1. **Draft night date.** Work back from it: Phases 0–3 done ≥1 week before (rehearsal draft in 3.7 needs real friends on real phones); final roster sync within 24h of the draft (D8).
2. **Position buckets.** Where the official listing says "Guard-Forward" etc., our rule-based `G|F|C` mapping may occasionally disagree with how the official fantasy game buckets a player. Admin override handles it; optionally cross-check the contested handful against the official game once its 2026-27 edition opens.
3. **Win-bonus edge case.** Negative PIR + team win under a flat ×1.1 (see 4.1) — verify against official scoring after Round 1; it's a config value either way.
4. **Roster template rigidity.** 5G/5F/3C is hardcoded as the league default but lives in `leagues.settings.roster_template` — decide before draft night whether 8 vs 12 participants changes the group's appetite (e.g., 12 teams × 13 players drafts 156 of ~350; some leagues drop to 11-man rosters at max participation). Pure settings, no code impact.
