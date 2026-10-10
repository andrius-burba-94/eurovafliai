# The log

What `docs/STATUS.md` used to carry beside its tables: the story of each
slice as it landed, what was checked after each deploy, the older "Try it on
localhost" notes and the long-form verification record. Moved here so that
STATUS.md answers "where are we?" in one screen and this folder answers "how
did we get here?" when somebody needs it.

Nothing here is authoritative about the present. If a line in this folder
disagrees with STATUS.md, STATUS.md is right and the line is history.

| File | What it holds |
|---|---|
| [slice-notes.md](slice-notes.md) | One narrative per slice, written when it landed — the reasoning behind decisions that look arbitrary from the tables alone, and the debt items closed along the way |
| [deploy-checks.md](deploy-checks.md) | What was checked on the box after each deploy, and how. The template to copy for the next one |
| [try-it.md](try-it.md) | "Try it on localhost" notes for slices whose phase has closed. The open phase's notes stay in STATUS.md |
| [verification.md](verification.md) | The long-form verification record: which bug each test found, the production checks, the numbers behind the table in STATUS.md at the time |
| [arena-redesign.md](arena-redesign.md) | The approved visual direction, browser findings and live-feed release gate for ADR-0009 |
| [design-history.md](design-history.md) | Every design contract before Matchnight (ADR-0011), verbatim |
| [matchnight.md](matchnight.md) | The Matchnight redesign, slice by slice: the critique, the gallery picks and what each slice changed |
| [basketnews-import.md](basketnews-import.md) | BasketNews Hostinger league import, source evidence, worker recovery and database verification |
| [domain-cutover-2026-10-05.md](domain-cutover-2026-10-05.md) | Custom domain DNS, TLS, deploy and public verification |
| [trades-and-rosters-2026-10-08.md](trades-and-rosters-2026-10-08.md) | Trade impact player against player in both rulesets, the trades timeline, automatic roster sync and the commissioner page clean-up |
| [ai-groundwork-2026-10-09.md](ai-groundwork-2026-10-09.md) | 7.0: why the model only narrates, tokens instead of names, the key and the tier, the starting-five capture and the backfill's same-line guard |
| [ai-round-written-2026-10-09.md](ai-round-written-2026-10-09.md) | 7.1: re-guard instead of rewrite-on-hash, no chat post, the settings page, the three previews, and what the live runs found |
| [free-agent-scout-2026-10-10.md](free-agent-scout-2026-10-10.md) | 7.2, slice by slice: the research, positions per game, last season loaded without touching this season, the chosen page, outlooks, moves and their private reasons, and the production steps |

Append to these when a slice's narrative would otherwise go into STATUS.md.
The rule for what goes where: a **table row, a Next-up line, an open debt
row, the current phase's Try-it note** live in STATUS.md; a paragraph that
explains *why* lives here, with the slice number in its heading.
