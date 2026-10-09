# 7.1 The round, written, 9 October 2026

Spec #182, tickets #183–#187. Scope was settled by grilling against STATUS,
blueprint Phase 7 and ADR-0012; the rewrite policy became ADR-0013.

## What the grill changed

- **When prose may change.** Rewriting on any input-hash change was the
  obvious rule and the wrong one: the latest round's sheet carries today's
  injury flags, and the hash covers the model and the prompt, so a flag
  clearing or a model bump would rewrite rounds people had already read.
  Instead a written round is re-guarded: rebuild the sheet, run the guard on
  the stored lines, rewrite only when they no longer hold (ADR-0013).
- **No chat post.** The maintainer wanted the write-up in one place, Recap,
  and the chat left to the members. Recorded as a deviation from blueprint 7.1.
- **A settings page, in the same PR.** On/off and voice wanted a home, and in
  season the member controls had none (the lobby is hidden on the dashboard),
  so the page took Delete league and member management too. Its way in is a
  gear on the sidebar's League header: as a row it pushed a manager's season
  sidebar past a 690px screen, which `shell.spec` guards.
- **Three previews before any Recap code.** A, the written headline replacing
  the computed one; B, a broadcast lower third on the winner banner; C,
  margin notes. The maintainer chose C and moved the "Also" sections (over,
  under, surprises) into the summary panel, so the summary is in one place
  and only the table, stars and swing lines sit on other panels.

## What the live runs found

On a copy of the local league, `gemini-3.5-flash-lite`:

- **The lite model mislabels sections when offered all six.** It wrote
  `under` for an OVERPERFORMER line and dropped the swing; the guard refused
  it, twice. The schema is now built per sheet: `sections` names only the
  sections that sheet has, all required. Rounds 2 and 3 then passed first time.
- **A failed rewrite keeps its last good prose** (the store's rule since 7.0),
  so the pass counts such a round as written; it had been retrying it.
- **No round ever had an underperformer** in a league without lineups. The
  rule required a starting role, and with no lineup nobody has one. Found by
  the maintainer's question on the previews ("is there anything for
  underperformers?"); the local rounds now carry three each.
- **Rewrite keyed on the wrong season.** Recap reads past seasons; the action
  looked the row up under the configured one. The season now travels with the
  form, and Rewrite is offered only for the current season, the only one the
  worker writes. Found by `writeup.spec.ts`.
- The worker wrote unattended (`1 written, 1 refused` on its first pass, the
  refusal being the mislabelled sections) and served a Rewrite within a
  minute of the request.

## Left as it was

The Recap's Biggest swing (5.4) and the sheet's swing disagree on a synced
drop and add: the first calls it a lone drop, the second one exchange, as the
trades page does. Both now sit on one panel; recorded as debt in STATUS.md.
