# Eurovafliai mobile: step 0 plan

Plan only, no code. Written 2026-11-27 against `main` at `31f1727`. External
facts were checked against live documentation that day; anything not verified
is marked **unverified**. Nothing below is built until you approve it.

## 0. Gates: what I need you to decide

Each one changes what gets built. My recommendation comes first.

**Answered 2026-11-27:** gates 1, 2, 3, 5 and 6, each with the recommended
option: one repo; tokens from `globals.css`; record D29; the phone can read and
set a lineup; a Cloudflare quick tunnel for real phones. Gate 4 (distribution)
stays open and is needed before slice 9.

1. **Repository layout (the decision gate in Part B).** **Approved 2026-11-27:
   one repo.** I recommend **one repo**,
   with the app at `apps/mobile` in this repository, not a second repo with a
   published package. Reasons are in §3. If you keep two repos, the fallback is
   a scoped private package on GitHub Packages, pinned by exact version.
2. **The token source disagrees with the prompt.** `.impeccable/design.json` is
   the **superseded arena system**: generated 2026-09-28, with a cyan accent and
   one ground. DESIGN.md (ADR-0011, matchnight) says `src/app/globals.css` "is
   the source of truth for every rendered value". That file has Tip-off orange
   and both grounds (`:root` dark, `:root[data-theme="light"]`). I propose
   generating the mobile tokens from `globals.css`, and either regenerating or
   deleting `design.json` in slice 1.
3. **The blueprint lists native apps as a v1 non-goal** (§1, line 13). That is
   not a §2 locked decision, and your prompt is the owner's instruction. Still, I
   propose recording the reversal as **D29** in the blueprint in slice 1, so the
   next agent does not "fix" it back.
4. **Distribution.** I recommend **TestFlight internal testing plus Play internal
   testing only** for now (§7). Public stores bring four obligations this app
   does not meet yet: Sign in with Apple, in-app account deletion, chat
   report/block, and licensing for crests and photos. Each is a separate approved
   slice.
5. **Lineup writes.** The scope lists "lineup" among the season reads, but
   `recordLineup` exists on web for unlinked leagues. I have assumed the phone
   **can set a lineup**; it is one endpoint. Say "read only" and I will drop it.
6. **Real phones against a dev stack.** The simulator and emulator can reach
   `localhost`. A real phone needs an https origin for Next and PocketBase. I
   propose a Cloudflare quick tunnel during development: no account, nothing on
   the VPS. The alternative is a throwaway league on production. Which do you
   prefer?

## 1. Endpoint list

### How a route is built

**Session.** `getSession()` (`src/lib/auth/session.ts:41`) reads the token from
the cookie. It will read `cookie ?? Authorization: Bearer` using `headers()`,
then `authRefresh()` exactly as today. Every existing read that calls
`getSession()` then works unchanged inside a Route Handler, so there is no second
session function and no token threaded through 20 readers.
`src/proxy.ts` lets `/api/v1/*` through when a bearer header is present. It stays
optimistic, and the handler makes the authoritative check. A bearer header is
never sent by a browser on its own, so there is no CSRF surface.

**Writes.** Each in-scope server action does four things today: session,
validation, writes, and revalidation or redirect. The middle two move into one
framework-free **command**:

```
command(pb, actor, input) → { ok: true, …data } | { ok: false, code, reason?, message, playerId? }
```

The server action becomes `requireSession → command → revalidateLeague/redirect
→ { error: message }`. Its return shape and web copy stay byte-for-byte the same.
The route becomes `requireSession → zod parse → command → JSON`. Each command
lives beside its pipeline or store, for example `src/lib/drafts/commands.ts`.
Every extraction is its own commit with the existing tests green before the route
is added. Failure-recovery stories move with the code unchanged: makePick's
pick-then-advance, startDraft's draft-then-league, and so on.

**Reads.** About a third of each screen's view model is computed **inside the
page file**. Examples: the draft page's `buildBoardShape`, `canPick` and
latest-pick round; matchday's player rows and game states; the team page's
summary and honours; the transactions filters and verdicts. For each in-scope
screen I extract one `read<Screen>View(…)` function into `src/lib/<area>/`. The
page and the route both call it, and the page keeps only JSX. This is the bulk of
the web-side work, and it is pure refactoring: Playwright must stay green with no
snapshot changes.

**Errors** are one closed set, with a zod schema shared with the app:

| code | HTTP | `reason` (only for conflict) |
|---|---|---|
| `unauthenticated` | 401 | — |
| `forbidden` | 403 | — |
| `not_found` | 404 | — |
| `invalid` | 422 | — (zod issues attached) |
| `conflict` | 409 | `not_your_turn`, `player_taken`, `raced`, `draft_paused`, `draft_finished`, `no_draft`, `roster_full`, `player_left`, `league_locked`, `slow_down` |

`message` carries the web's own sentence (for example "Gone — that slot or that
player was taken a moment ago."), so both clients use the league's voice. The app
displays it and never parses it; it branches on `code` and `reason` only.

### The routes (base `/api/v1`)

**Exists** means the function is already framework-free. **Extract** means its
logic sits in a page or action and moves out first.

| Route | Wraps | Work |
|---|---|---|
| `GET /meta` | none: `{ apiVersion, minAppVersion }` from config | new |
| `GET /time` | same body as `api/time/route.ts` | new; the old route stays for web |
| `GET /me` | `getSession` | exists |
| `GET /leagues` | `listMyLeagues` (`leagues/queries.ts:45`) and `readShellLeagues` (`:141`); the page's `NEXT` status→action map (`page.tsx:29`) | extract the map |
| `POST /leagues` | `createLeague` → `createLeagueCommand` | extract. EuroLeague ruleset only; a BasketNews-linked league stays on web |
| `POST /leagues/join` | `joinLeague` → command | extract |
| `GET /leagues/:ref` | `getLeagueWithMembers` (`:196`) + `navLeagueFrom` + `navFor` + `tabsFor`; slug or id resolves the same way | extract the page's `viewerIsMember` / `viewerIsManager` / `slotsLeft` (`l/[league]/page.tsx:87–113`) |
| `POST /leagues/:id/ready` | `setReady` | extract |
| `PATCH /leagues/:id/me` | `renameTeam` + `setTeamIdentity` (own team only) | extract both |
| `GET /leagues/:id/order` | `serverRollCeremony` (`roll/snapshot.ts:24`) + the page's `inOrder` (`order/page.tsx:59`) | extract |
| `GET /leagues/:id/chat` | `readMessages` (`chat/store.ts:101`) | exists |
| `POST /leagues/:id/chat` | `sendChatMessage` → command (rate limit included) | extract |
| `DELETE /leagues/:id/chat/:msg` | `retractChatMessage` → command | extract |
| `GET /leagues/:id/draft` | `getDraftView` (`drafts/queries.ts:175`) + page computation (board shape, entries, needs, latest pick, `canPick`, stuck sentence, pool label: `draft/page.tsx:78–407`) | extract `readDraftRoomView` |
| `POST /leagues/:id/draft/picks` | `makePick` → `pickCommand` (also covers "pick for them": the server decides who is on the clock) | extract |
| `PUT /leagues/:id/draft/autodraft` | `setAutodraft`, own membership only | extract |
| `POST /leagues/:id/draft/start` | `startDraft` | extract |
| `PUT /leagues/:id/draft/paused` | `setDraftPaused` (pause and resume) | extract |
| `POST /leagues/:id/draft/rollback` | `rollbackDraft` | extract |
| `GET /leagues/:id/sheet` | `getCheatSheetView` (`sheets/queries.ts:70`) | exists |
| `PATCH /leagues/:id/sheet` | `editCheatSheet` (one `SheetOperation`: move, tier, remove, insert) | extract |
| `POST /leagues/:id/sheet/seed` | `startSheetFromRanking` | extract |
| `GET /leagues/:id/dashboard` | the season branch of `l/[league]/page.tsx` (snapshots, transactions, progress, write-up, scout line, recap, matchday) + `SeasonDashboard`'s `dashboardStandings` / `movementOf` / `roundStory` | extract `readDashboardView` |
| `GET /leagues/:id/standings` | `readStandingsSnapshots`, `readRoundProgress`, `readProvisionalRounds` + page and `StandingsTable` computation (`completedOnly`, honours, badges, `nightPlace`) | extract |
| `GET /leagues/:id/recap?round=` | `readLeagueRecap`, `readRoundWriteup`, `readRoundBrief` (private: the member comes from the session), `briefPlace` | extract the page's open/written gates |
| `GET /leagues/:id/lineup?round=&member=` | `readLineupBoard`, `readLineupLive`, `readComparisonPlayers`, panel schedule | extract the page's round and member choice |
| `PUT /leagues/:id/lineup` | `recordLineup` (gate 5) | extract |
| `GET /leagues/:id/matchday?round=` | `readMatchdayData` + `readLineupBoard` + the page's rows, game states and counts (`matchday/page.tsx:39–369`) | extract (the heaviest) |
| `GET /leagues/:id/scout` | `readScout` + `readScoutReasons` + the page's reasons map | extract |
| `GET /leagues/:id/players` | `getPool` (`rosters/queries.ts:70`); filters applied server-side | exists |
| `GET /leagues/:id/players/:ref` | `resolvePlayerId`, `readPlayerProfile`, `readNewsFor` (the pattern in `api/players/[id]/route.ts`) | small extract (`bio`, `heat`) |
| `GET /news` | `readNews` | exists |
| `GET /leagues/:id/transactions` | `readLeagueDeals` + page filters and verdicts (`transactions/page.tsx:38–127`) | extract |
| `GET /leagues/:id/teams/:ref` | `readMemberRoster`, `readMemberDeals`, `readLeagueStats`, `readMatchdayData` + page computation (`[team]/page.tsx:75–494`) | extract |
| `GET /leagues/:id/panel?round=` | `readPanel` (`panel/queries.ts:26`); move `gameScores` out of `components/game-tile` into lib | small extract |

That is 34 routes. Privacy is enforced in the function, not the route: the
sheet, the brief and the scout's moves all take the member from the session.
Each gets a test proving another member gets 403 or 404.

Not wrapped, because they are out of scope: `setPickClock`, `resetDraft`,
`deleteLeague`, `kickMember`, `setMemberPermission`, `setWriteupSettings`,
`requestRoundRewrite`, draft setup, imports, mapping, news admin, fantasy sync,
`recordTransaction`, `submitCheatSheet` (CSV paste), export.

Tests: Vitest over `tests/unit/helpers/fake-pb.ts` per command and per route,
with the two permission tests per route (a non-member, and another member). The
existing action tests keep passing against the thin actions. `pb:verify` is
unchanged, since no rules change.

## 2. Shared package contents

The package is `packages/core`, named `@eurovafliai/core`, written in TypeScript
source. Files are **moved, not copied**; web imports change mechanically in one
commit.

| From | Why the app needs it |
|---|---|
| `src/lib/engine/*` (whole directory, `index.ts` the only entry) | board, radar, order, clock, legality for dimming. Moving the whole directory keeps `purity.test.ts` meaningful |
| `formatTenths` out of `src/lib/stats/scoring.ts` into `core/tenths.ts` | every figure; `scoring.ts` imports it back |
| `src/lib/positions.ts` | position words, `leagueSource` |
| `src/lib/cues/cues.ts` | `clockCue`, `clockSentence`, cue constants |
| `src/lib/sheets/ranking.ts`, `reorder.ts` | `tierOfRank`, `applyOperation` for an optimistic reorder that the server then confirms |
| `src/lib/nav/items.ts` (`navFor`, `tabsFor`, `NavLeague`) + `nav/urls.ts` | tab bar and More. `navLeagueFrom` stays in web because it needs the PocketBase record type |
| `src/lib/teams/identity.ts` (colours and crest shapes) | crests |
| the OKLCH→sRGB math now private to `src/app/tokens.test.ts` | one converter for the web contrast test and the mobile token generator, which is the "faithful conversion" test the prompt asks for |
| new `core/api/*`: zod request and response schemas plus the error set | the contract |

`purity.test.ts` moves to the package root and extends to every file: no
PocketBase, no `next`, no `react`, no I/O, no `process.env`. The package's only
dependency is `zod`, as a peer.

## 3. Distribution: why one repo

|  | One repo (recommended) | Two repos + GitHub Packages |
|---|---|---|
| A slice that adds a route and its screen | one PR; CI typechecks client and server against the same schema | web PR → you approve a publish → mobile PR bumps the pin. Your "publish needs my confirmation" rule makes that a gate in every slice, nine times |
| Contract drift | impossible to merge | caught only when the mobile repo bumps |
| Secrets | none new | classic PAT with `read:packages` (fine-grained tokens are not supported) stored as `NPM_TOKEN` in EAS and in mobile CI |
| Build step | none: Metro and Next both read the TypeScript source (Next via `transpilePackages`) | the package must be compiled to JS + `.d.ts`; untranspiled TS from a registry package is **unverified** for Metro |
| Web deploy | unchanged if the app is kept out of the root install (below) | unchanged |
| Cost | `.easignore`, a CI path filter, a second `eslint`/`knip` scope | a second repo, CI, issue tracker and STATUS file |

A git dependency pinned by tag is ruled out because npm cannot install a
subdirectory of a repository.

**How the one-repo layout avoids the two real risks:**

- **React versions.** Web pins `react` 19.3.1; Expo SDK 58 pins 19.3.0, and React
  Native checks the version match.
- **The VPS install.** `scripts/deploy.sh` runs `npm ci`, which would pull React
  Native onto the box.

So the root `workspaces` holds only `packages/core`, and the web app stays at the
root (no file moves). `apps/mobile` is its **own npm project with its own
lockfile**, depending on `"@eurovafliai/core": "file:../../packages/core"`. The
VPS and web CI never install it, and React versions never meet.

The price is one Metro `watchFolders` entry, because Expo's automatic monorepo
setup covers workspaces and this is a `file:` link. Proving it with a real EAS
build is the first task of slice 1. If it fails, the fallback is making
`apps/mobile` a workspace and pinning web to the SDK's React.

`eas.json` lives in `apps/mobile`. `.easignore` at the git root excludes
`pb/pb_data`, `.next`, `tests/e2e` and `data/`.

## 4. Auth flow and human setup

Same Google **Web** client, same PocketBase `google` provider, so the same
`_externalAuths` row and the same user. First-time sign-in creates the user
through PocketBase's own OAuth2 create path, so `pb:verify:oauth2` still proves
it.

1. The app calls `pb.collection("users").listAuthMethods()` and stores `state`
   and `codeVerifier` in SecureStore, which survives Android killing the app
   mid-flow.
2. `WebBrowser.openAuthSessionAsync(authURL + encodeURIComponent("https://eurovafliai.com/auth/app-callback"), "eurovafliai://auth")`,
   reusing `buildAuthorizeUrl`.
3. **New Next route `/auth/app-callback`.** It is stateless, reads no cookies and
   does no exchange. It replies 302 to `eurovafliai://auth?code=…&state=…` (or
   `?error=…`) and never logs the code. A "Return to the app" link in the body
   covers a Custom Tab that does not follow the 302 (**unverified**).
4. The app checks `state` in constant time, then calls
   `authWithOAuth2Code("google", code, codeVerifier, "https://eurovafliai.com/auth/app-callback")`.
   PKCE means an intercepted code is useless without the verifier.
5. Token storage: `AsyncAuthStore` over SecureStore. The app awaits `initial`
   before the first request, calls `authRefresh()` on launch and on foreground,
   and clears the store on 401. Sign-out clears the store and closes realtime,
   because PocketBase refuses a different user on the same realtime connection.

Rejected options:
- The SDK's all-in-one `authWithOAuth2`: PocketBase's success redirect lands on
  `/pb/_/`, which nginx answers with 403, and Android cannot close the tab.
- A native Google Sign-In ID token: PocketBase never reads `id_token`, so it
  would need a hand-written user-linking hook.

**Human steps:**

- **Google Cloud Console,** the existing Web client: add
  `https://eurovafliai.com/auth/app-callback`. No iOS or Android client, no SHA-1,
  no bundle id. Check the consent screen is "In production"; in "Testing" only
  listed users can sign in.
- **PocketBase admin:** nothing.
- **App config:** `scheme: "eurovafliai"`. Bundle id and package name to decide;
  I propose `com.eurovafliai.app`, display name "Eurovafliai".

## 5. Screen map against `navFor`

expo-router. The tab bar is `tabsFor(navFor(…))`: in season Home, Lineup, Live,
Table, More; while drafting Home, Draft, Sheet, Players. There is one map from
`NavKey` to a native route, and a key with no native screen opens the web page in
an in-app browser (`expo-web-browser`), so the app never shows a destination that
cannot open.

| NavKey | Native screen | Presentation |
|---|---|---|
| `leagues` | `/(app)/index`: leagues list; create and join as sheets | root stack |
| `league-home` | `/l/[league]/home`: lobby (ready, team identity, chat) in `setup`; door to the room in `drafting`; season dashboard in `season` | tab |
| `draft` | `/l/[league]/draft`: band, clock, pool (search and filters), board, radar, choose then draft, autodraft switch, manager controls | tab |
| `order` | `/l/[league]/order`: the roll | stack push |
| `sheet` | `/l/[league]/sheet` | tab while drafting |
| `pool` | `/l/[league]/players`, `/players/[player]` | tab or stack |
| `lineup` | `/l/[league]/lineup` | tab |
| `matchday` | `/l/[league]/matchday` ("Live") | tab |
| `standings` | `/l/[league]/standings` ("Table") | tab |
| `recap` | `/l/[league]/recap`: write-up plus "Your round" | More → stack |
| `scout` | `/l/[league]/scout` | More → stack |
| `trades` | `/l/[league]/transactions` (read only) | More → stack |
| `team` | `/l/[league]/[team]` | More → stack, and from any crest |
| `news` | `/news` | More → stack |
| chat | a sheet over the lobby, room and dashboard | sheet |
| `stats`, `settings`, `export`, `mapping`, `import-players`, `import-stats`, game box scores | **web**, opened in the in-app browser | — |

League stats and the live box score are live on web but are not in your scope
list, so they open on web. Say if either should be native.

## 6. Dependencies (`apps/mobile`)

Versions follow Expo SDK 58 (React Native 0.88, React 19.3.0, New Architecture
only).

| Package | Why |
|---|---|
| `expo`, `react`, `react-native` | the SDK |
| `expo-router` (+ its peers `react-native-screens`, `react-native-safe-area-context`, `expo-linking`) | navigation and deep links |
| `expo-dev-client` | development builds, since the custom scheme rules out Expo Go |
| `@tanstack/react-query` | the one query cache |
| `pocketbase` (same `^0.28.1` as web) | auth and realtime. Note: the SDK repo was archived 2026-10-26 and moved to its author's site; npm `latest` is 0.29.0. Both versions stay in lockstep with web |
| `react-native-sse` | the SDK's documented EventSource polyfill |
| `zod` | the shared schemas |
| `@eurovafliai/core` | `file:` link |
| `expo-secure-store` | token and PKCE verifier |
| `expo-web-browser` | auth session, and opening web-only destinations |
| `expo-font` + `@expo-google-fonts/barlow-condensed`, `/space-grotesk`, `/jetbrains-mono` | the three faces, embedded at build time through the config plugin |
| `expo-haptics` | the on-the-clock cue in the hand, which iOS web never had |
| `expo-audio` | the cue tone (`expo-av` is gone since SDK 55) |
| `expo-network` | TanStack `onlineManager` and the offline state |
| `expo-system-ui` | Android follows light and dark in dev builds |
| `expo-application` | the installed version for the `minAppVersion` check |
| dev: `jest-expo` (Jest 30), `@testing-library/react-native` ≥14, `typescript`, `eslint` + `eslint-config-expo` | tests and lint |
| CI only: Maestro CLI | the four critical flows |

Deliberately left out:
- Reanimated: React Native's `Animated` plus `reduceMotionChanged` cover the
  motion budget.
- A gesture library: the sheet reorders with buttons, as web does.
- NetInfo: `expo-network` does the same job.
- Any UI kit or analytics SDK.

## 7. Risks

### Verified against documentation (2026-11-27)

- **React Native has no `oklch`** (hex, rgb, hsl and hwb only). Tokens are
  converted to hex at generation time, with a test against the shared converter.
- **The PocketBase realtime path with a bearer token works.** `GET /api/realtime`
  is unauthenticated, and the subscription POST carries `Authorization`. The
  server drops idle connections at 5 minutes and every connection at 30 minutes;
  nginx's 360 s timeout fits. react-native-sse does not survive backgrounding, so
  the hook closes on background and reopens with a full catch-up on `active`.
  This is a refetch of every active query, not a patch.
- **TanStack mutations default to `networkMode: 'online'`,** which pauses an
  offline mutation and **replays it on reconnect**, the late pick the prompt
  forbids. Every mutation is set to `networkMode: 'always'`, and every write
  button is disabled offline with the stated reason.
- `announceForAccessibility`, `reduceMotionChanged`, `fontScale` and
  `maxFontSizeMultiplier` all exist. The board caps scaling per element rather
  than disabling it.
- `expo-audio`'s `playsInSilentMode` defaults to **true**. The cue sets it to
  false so the mute switch is honoured.
- `userInterfaceStyle: "automatic"` plus `useColorScheme`; Android also needs
  `expo-system-ui`.
- EAS monorepo support: `eas.json` sits in the app directory, the upload is the
  git root, and `.easignore` replaces `.gitignore`.
- The Maestro `type: maestro` job in EAS Workflows is **alpha** and runs
  simulator or APK builds. Running it in GitHub Actions on an emulator is the
  fallback.

### Not verified (proved or disproved in the named slice)

- ~~Whether Metro follows a `file:`-linked TypeScript package~~: **proved in
  slice 1** with `expo export` for iOS and Android on a throwaway SDK 58 app
  with no `node_modules` above it. The config is `watchFolders` plus
  `nodeModulesPaths`; `disableHierarchicalLookup` breaks `expo-asset`. EAS's
  upload and install are still unproved, and are slice 2's first build.
- That an Android Custom Tab follows a 302 to `eurovafliai://`. Slice 2; the
  "Return to the app" link covers it.
- That SSE survives nginx and **cellular** on both platforms, and that the dev
  client's network inspector does not buffer SSE on Android (community reports
  say OkHttp interceptors can). Slice 3, observed on a real phone on mobile
  data.
- That PocketBase 0.39.11's OAuth2 code matches the master-branch source that was
  read. Slice 2, on the first real sign-in.
- Whether App Review enforces chat report/block on an invite-only chat. Only
  matters for a public store.

### Store obligations (Apple guidelines dated 2026-10-16; Google Play help pages)

These do not block TestFlight internal testing or Play internal testing. They do
block **external TestFlight** (whose first build goes to App Review, guideline
2.2) and both public stores.

- **4.8:** Google as the only sign-in requires an equivalent login, and in
  practice that means **Sign in with Apple**. That is a new PocketBase `apple`
  provider. It also brings an identity question: an Apple "hide my email" user is
  a different PocketBase user from their Google self, unless they link Apple
  while signed in with Google.
- **5.1.1(v) and Play:** account deletion must start in the app, and Play also
  wants a web link. Nothing on web deletes a user today, and deleting one touches
  memberships, picks history and chat authorship, so it needs its own design.
- **1.2:** chat needs a filter, report, block and a published contact.
- **5.2.1/5.2.2:** EuroLeague and club crests, player photos and the feed need
  permission or must be dropped from the app (ADR-0010's official media).
- Also needed: a privacy policy (in the app and in the listing), the App Privacy
  label, the privacy manifest's required-reason APIs, Play's Data safety form, a
  working Google test account for review, and, for a personal Play account,
  **12 testers opted in for 14 consecutive days** before production.
- Internal TestFlight means each friend becomes an App Store Connect user on your
  team (up to 100), and builds expire after 90 days. Play internal testing takes
  up to 100 testers by email.

## 8. What I need from you, before the slice that uses it

| Item | Needed by |
|---|---|
| Gates 1–6 above | slice 1 |
| Expo account (personal, per the account boundary) and an EAS project | slice 2 |
| Bundle id / package name and app name | slice 2 |
| The Google Web client redirect URI added (§4) | slice 2, the first real sign-in |
| Apple Developer Program membership and an App Store Connect API key for `eas submit` | first iOS device build (internal distribution needs device UDIDs via `eas device:create`) |
| Google Play Console account and a service-account JSON | first Play internal build |
| Public stores or internal only | before slice 9 |

## 9. Slices, adjusted

Your order is unchanged. Two notes:
- `/auth/app-callback` ships in slice 1 with the API foundation, because a dev
  build cannot sign in until it is live on `eurovafliai.com`. It is stateless and
  harmless to deploy early.
- Every read extraction lands in the slice whose screen needs it, so slice 7
  (season) carries the largest web refactor: matchday, team and standings.

`docs/mobile/` holds this plan. The app's own `STATUS.md` starts in slice 2, and
the web `docs/STATUS.md` gains an "API v1" table in slice 1.
