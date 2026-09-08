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

Append to these when a slice's narrative would otherwise go into STATUS.md.
The rule for what goes where: a **table row, a Next-up line, an open debt
row, the current phase's Try-it note** live in STATUS.md; a paragraph that
explains *why* lives here, with the slice number in its heading.
