# 7.0 AI groundwork, 9 October 2026

Phase 7 as written was a draft-night menu: a pick advisor, a draft recap, a
chat pundit. The draft was over and the league was in round 4, so the phase
was rescoped to the season (blueprint D28) around what the maintainer asked
for: a short round summary, an analyst's round report, and free-agent
suggestions with reasons. This slice builds what every one of those needs and
nothing a member sees.

## Why it is built this way

**The model narrates; it does not compute.** The first design question was
how much to trust a model with the league's numbers, and the answer was
none: friends check standings. So every figure, rank and judgement is decided
by tested code in a fact sheet, and the model only writes it as prose. A
judgement is a label with a named threshold (`OVER_BY`, `UNDER_RATIO`,
`CAPTAIN_REGRET`), tested at its boundary. The one place this bit during the
slice was the test author: the bench player in the fixture league also cleared
the overperformer bar, and the code was right.

**Tokens, not names.** Teams go out as `@T1…` and players as `#P1…`. Three
reasons, any one sufficient: friends' names are not ours to send; a model fed
no free text has nothing to be talked into; and the guard can only tell an
invented player from a real one against a closed list. The cost is rendering,
which is now a feature: names are put back at read time, so a team rename
updates every old write-up. Publisher headlines and transaction notes are
never sent either, for the same reasons.

**The guard is the gate, not a lint.** A write-up that cites a number the
sheet does not contain, an unknown token, a spelled-out name or markdown is
refused, retried once with the faults listed, then dropped. It reads numbers
with the same function that built the allowed set, so "in the facts" has one
meaning. A softer check — a number attributed to the wrong player's line —
only warns until preview runs show how often a fair sentence trips it.

**Nothing from after the round.** `players.proj_*` and `players.status` are
today's values; a sheet about round 3 written in round 5 must not use them.
Averages are rebuilt from earlier rounds' lines, deals count only through the
round, and today's injury flag appears only in the next-round section, with
its report date — because the scraper raises flags and only a person clears
them, and the local league showed nearly every team with two "unavailable"
players on old flags.

**Interactions with `store: false`.** Google now recommends the Interactions
API for new projects; by default it keeps every interaction (a day on the free
tier, 55 on paid). Nothing here continues a conversation, so nothing is kept.
The probes found two things documentation did not say: the endpoint wraps its
error body in an array, and a schema does not stop the lite model opening an
answer with a sentence and a code fence. The client handles both, and trusts
only `status: "completed"`.

## The key and the tier

The maintainer has Google AI Plus and expected its limits to apply. They do
not: Google states plan benefits "apply only within the Google AI Studio web
interface" and API keys are billed separately, so the key runs on the free
tier. The free tier would let Google use prompts to improve its products —
except that its terms apply the paid-service data terms to users in the EEA,
which the league is. Tokens make the question moot either way.

The key was added to the local `.env` under a typo (`GOOFLE_API`) and renamed
in place to `GEMINI_API_KEY` without being printed. Copying it to the VPS
`.env` over SSH stdin was refused by the session's safety classifier as a
secret-store write, so it was left for a person to run (see "Production"
below). The `GEMINI_` prefix also keeps it out of CI's `GOOGLE_*` sweep into
its generated `.env`.

## Who started each game

The data audit for the fact sheet found most of the gain in joins of data
already stored — availability from box scores, opponent and result from
`fixtures`, minutes trends — and one capture worth adding: the v2 box score
the ingest already reads carries `startFive`, parsed and dropped until now.
Probed on E2026 games 1, 2, 5, 7, 12, 15, 20, 28 and 33: exactly five a side,
matching the live feed's `IsStarter`. It is stored as `yes` / `no` / unknown,
so a CSV line never reads as bench and a sheet never erases a start.

The backfill found a real hole on its first local run: the local database
holds a rehearsal's games filed under E2026, so "same player, same game code"
matched the wrong game and wrote today's starts onto it. It now also requires
the same club and round; rerun on a clean copy it wrote 125 rows (the real
E2026 lines) and left the rehearsal rows unknown, and a second run wrote none.

## Measured

On the local league's round 3 (8 teams, a 9,543-character sheet), three live
summaries passed the guard first time: `gemini-3.5-flash-lite` in both
voices (about 4,600 input and 120 output tokens, 1.4–1.6 s) and
`gemini-3.8-flash` as pundit (141 output tokens, 2.6 s), which named more of
the night's players. About ten calls in all, deliberately on the lite model.

## Production

Merging deploys two additive migrations (`ai_writeups`,
`player_game_stats.started`) and changes no page. Then, on the box:

- add the key, by hand, without echoing it:
  `grep '^GEMINI_API_KEY=' .env | ssh hstgr 'cat >> /var/www/eurovafliai/.env'`
  (the file ends with a newline today; check by length, never by value);
- `npm run stats:starters` once, from `/var/www/eurovafliai`.
