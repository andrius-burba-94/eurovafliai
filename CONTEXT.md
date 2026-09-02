# Ubiquitous language

The words the league already uses, and therefore the words the code uses. If a
name in a variable, collection, route or UI label disagrees with this list,
change the name — not the list. Add a term here in the PR that introduces it.

## Draft

| Term | Meaning | In code |
|---|---|---|
| **pick** | One selection: a member takes a player at a given overall number. | `picks` record; `overall_no`, `round`, `slot` |
| **overall number** | The pick's index across the whole draft, 1…(members × rounds). Unique per draft. | `picks.overall_no` |
| **on the clock** | The member whose turn it is right now, with a running deadline. | `whoIsOnClock()`, `drafts.current_pick`, `drafts.deadline` |
| **the board** | The rounds × teams grid of everything picked so far. The draft room's centerpiece. | draft board UI (Phase 3.1) |
| **slot** | One position on the board: a round crossed with a team. Empty, filled, or the one on the clock. Also a member's place in a lobby before the draft exists. | `picks.slot`; the `Slot` component (Phase 1.4) |
| **the pool** | Every player still available to draft. | filtered `players` |
| **radar** | The 5G/5F/3C slot matrix per team, filling live; shows what a roster still needs. | Live Roster Radar (Phase 3.2) |
| **cheat sheet** | A member's private ranked player list, with optional tier breaks. Drives autodraft. | `cheat_sheets` |
| **tier** | A break in a cheat sheet grouping players of similar value. | `cheat_sheets.tiers` |
| **the roll** | The seeded shuffle that determines draft order, revealed live one slot at a time. | `order_mode: 'roll'`, `drafts.seed` |
| **order mode** | How draft order is decided: `roll`, `manual` or `reverse_standings`. Orthogonal to format. | `drafts.settings.order_mode` |
| **format** | How order repeats across rounds: `linear`, `snake`, `snake3rr`, `keeper`. | `drafts.format` |
| **3RR** | Third-round reversal — snake, but round 3 repeats round 2's direction. | `snake3rr` |
| **autodraft** | The engine picking for an absent or timed-out member. Armed on purpose (`autodraft_enabled`, the member's own switch) or reached by running out of time; either way the sweep makes the pick. | `league_members.autodraft_enabled`, `picks.is_auto`, `selectAutoPick()` |
| **the sweep** | The worker's ~1s tick — the only thing that enforces a deadline. Autodrafts, and repairs the three states no request would ever notice. | `src/worker/sweep.ts`, `sweepOnce()` |
| **clock offset** | The difference between a device's clock and the server's, fetched once so a countdown is honest. A phone whose clock is fast must not tell its owner they are out of time. | `/api/time`, `PickClock` |
| **rollback** | Undoing the draft back to a chosen pick number; later picks are deleted and the draft re-pointed. | `computeRollback()` |
| **commissioner mode** | The commissioner entering picks made offline, or for a member whose phone has died. | Live since 2.4: the room shows a manager a "Pick for them" button for whoever is on the clock. The fuller offline-entry flow is Phase 3.6 |
| **draft trade offer** | One offer per member per draft, announced in chat before the offerer's next pick. | `draft_trade_offers` |

## League & season

| Term | Meaning | In code |
|---|---|---|
| **league** | One private competition: a commissioner, its members, its settings. | `leagues` |
| **commissioner** | The admin of a league. Configures, rolls, pauses, rolls back, approves. | `leagues.commissioner` |
| **member** | A participant in a league, with a team name and a draft position. | `league_members` |
| **deputy** | A member the commissioner has granted the league's management powers: draft setup, the order, renaming and removing. Not a separate role, a flag — and never able to appoint another deputy or remove the commissioner. | `league_members.can_manage` |
| **lobby** | The pre-draft room where members gather, get named, and are marked ready. | Phase 1.3 |
| **ready** | A member's own signal that they are at their device and can start. Self-declared: nobody, commissioner included, marks anyone else ready. | `league_members.is_ready` |
| **invite code** | The short string a commissioner shares out of band; entering it is how you join a league. Unique across leagues. | `leagues.invite_code` |
| **league status** | A league's coarse lifecycle: `setup` (lobby open) → `drafting` (a draft is running) → `season` (drafted, tracking games) → `complete`. Distinct from the finer-grained `drafts.status`. | `leagues.status` |
| **draft position** | A member's slot in the draft order, 1…N. Unset until the roll. | `league_members.draft_position` |
| **roster template** | The shape of a legal team: `{G:5, F:5, C:3}` by default. Lives in settings, never hardcoded. | `leagues.settings.roster_template` |
| **membership** | A player's stay on a team, as a date window (`from_date` → `to_date`). The backbone of trade-impact maths. | `roster_memberships` |
| **transaction** | A trade, add or drop. | `transactions` |
| **impact / delta** | Fantasy points of players-in minus players-out **since** a transaction's date. | Phase 5.3 |
| **free agent** | A pool player owned by nobody after the draft. | — |
| **snapshot** | The standings table frozen for one round; powers the round-over-round chart. | `standings_snapshots` |
| **round** | Ambiguous on purpose — qualify it. A *draft round* is one pass through the order (1…13). A *Euroleague round* is a game week (1…38). | `picks.round` vs `player_game_stats.round` |

## Players & scoring

| Term | Meaning | In code |
|---|---|---|
| **player** | A real Euroleague player in the canonical table, whatever the source. | `players` |
| **position bucket** | Our single-letter position: `G`, `F` or `C`. Official multi-position listings map into one bucket by rule, admin-overridable. | `players.position` |
| **person code** | The Euroleague external player id. Preserved through any overwrite so stats joins survive. | `players.person_code` |
| **normalized name** | Diacritics-folded name for search and matching — "Valančiūnas" must be findable as "valanciunas". | `players.name_normalized` |
| **manual lock** | An admin correction that neither ingestion source may overwrite. | `players.manual_lock` |
| **roster authority** | Which source may write players right now: `api` or `csv`. The other runs report-only. | app setting; Phase 2.1 |
| **import batch** | One stored ingestion run — its diff, its log, re-applicable. | `roster_imports`, `stat_imports` |
| **PIR** | Euroleague's Performance Index Rating. Our fantasy base sum is exactly PIR. | `player_game_stats.pir` |
| **fantasy points** | PIR plus the official 10% team-win bonus: `PIR × 1.1` on a win, `PIR` otherwise. Stored as **integer tenths** — no floats, ever. | `player_game_stats.fantasy_pts` |
| **projection** | Rolling last-5 and season averages, materialized onto a player after each ingest. | `players` projection fields |

## Words we do not use

- **"draft pick" as a tradeable asset slot** — say *pick* for the selection; a
  future pick being traded is stated explicitly as a *pick swap*.
- **"team"** alone is ambiguous (Euroleague club vs. a member's fantasy squad).
  Say **club** for the real team, **roster** or **member's team** for ours.
- **"points"** alone — say **PIR**, **fantasy points**, or **standings points**.
- **"admin"** — the role is **commissioner**. (`superuser` is only PocketBase's.)
- **"auction"** — cut in decision D6. Not part of this product.
