---
target: slice 3.5 league chat
total_score: 21
max_score: 40
na_heuristics: 
p0_count: 2
p1_count: 3
timestamp: 2026-09-07T20-49-41Z
slug: src-components-league-chat-tsx
---
Method: dual-agent (A: design review · B: detector + browser evidence), both driving the real signed-in
app at 390x844 and 1440x900. Every P0/P1 was independently re-verified by the parent against the source
before being accepted; all of them held.

## Design Health Score — 21/40

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 2 | Zero live regions; the arriving line has no live ancestor. No timestamps anywhere |
| 2 | Match System / Real World | 3 | Announcements are excellent prose; the component's own five strings are fragments assembled in JSX |
| 3 | User Control and Freedom | 1 | Delete: one tap, no confirm, 0 undo controls, focus to `<body>`, body cleared in the DB. Unrecoverable |
| 4 | Consistency and Standards | 2 | Transcript is an unruled, unclosed div of `<p>` rows; every other list here is a `Slots` run. Refusal is a bare `<p>`, not `Correction` |
| 5 | Error Prevention | 2 | `CHAT_MAX_LENGTH` exported and never imported by the component: a 2000-char paste is refused only after Send |
| 6 | Recognition Rather Than Recall | 2 | No timestamps. "N new" printed twice, ~90px apart |
| 7 | Flexibility and Efficiency | 2 | The scrolling transcript is keyboard-unreachable for anyone who has not written in it — WCAG 2.1.1 |
| 8 | Aesthetic and Minimalist | 2 | No material; top row sliced mid-line on open; one legal message is 2.4x the whole region |
| 9 | Error Recovery | 2 | Real progress (results captured, role=alert, sentence handed back) but a delete has no recovery |
| 10 | Help and Documentation | 3 | The empty state explains the panel in one sentence |

## Design Specificity Verdict

Model 8/10, material 4/10 — and the split is the finding.

`src/lib/chat/messages.ts` is the best-written file in the slice: one function per event, one `#N` format,
"autodrafted" vs "drafted", no "you" in a line twelve people read. Withdrawing the blueprint's
client-direct exception and moving instant-ness to the read side is a genuinely product-specific argument.

The material is the most category-generic thing this app has built. The transcript is `<p>` rows in an
unruled `overflow-y-auto` div with an 8px gap — measured `border-bottom: 0px`, no top rule, no closure.
Every other list in this app is a `Slots` run whose top border IS its state and which closes with
`border-b border-rule-strong`. The radar's critique fixed "the list used to just stop"; chat
re-introduced it. Swap the strings and this panel drops into any app unchanged.

Deterministic scan: CLI clean on all six files, positive control PASSED (poisoned copy -> exit 2,
`ai-color-palette` + `bounce-easing`). But narrowly: B enumerated the executable set precisely at
**18 of 59 rules on `.tsx`**, so 41 cannot fire. (STATUS previously said "~15"; 18 is better-derived.)

Overlay detector (injection available; live server on 8400, confirmed stopped): 25-27 findings with the
room's panel open, and every chat-attributable one is a FALSE POSITIVE — `text-occlusion` on transcript
rows scrolled out of the panel, each verified `insideChatListViewport: false`. `em-dash-overuse` was B's
own seeding artefact; the app's real announcements contain no em dashes.

## What Works

1. `messages.ts` is exemplary, and it earns the debt it closes.
2. The failure story is handled — 3.4b's P0 was "nothing on this surface can report a failure"; both
   paths capture their result and hand the sentence back, verified live.
3. 44px on both axes, third slice running. System voice is never colour alone: rail blue 4.64:1 plus an
   `sr-only` label plus the absent team name. Delta-E76 34.1 normal / 32.6 greyscale / 34.1 deuteranopia —
   no collapse, unlike the radar's 0.00.

## Priority Issues

### [P0] The collapsed header truncates away the exact payload the slice exists for
`league-chat.tsx:344`, fed by `:327`/`:351`. At 390x844 the rollback line gets 212px of 350px — 43.7%
visible; a six-team roll shows 36 of 142 characters; draft-complete 34 of 57. It WIDENS to 282px when
open — more room in the state where it is redundant, because the in-row badge hides when open. STATUS's
own try-it note claims the header "shows the whole order, numbered, without you opening anything."

### [P0] Nothing is announced to a screen reader
Zero `aria-live`, zero `role="status"` on the surface (both agents); the latest line has no live ancestor.
The slice's core promise — a rollback reaching everybody — is silent to assistive tech. Same unmet
PRODUCT.md promise as the on-the-clock banner.

### [P1] The transcript is not this app's material, and one message can swallow it
Unruled, unclosed 40vh div. 10 of 45 rows visible, top row clipped mid-line, line measure 704px ~95ch at
1440 (3.4a's `line-length` finding, uncapped again), a legal 2000-char message 820px = 2.4x the region.
Separately: a long URL hides 526px inside the panel at 390px — `overflow-wrap: normal`, no `break-words`.

### [P1] A destructive, irreversible action with no confirm, no undo, focus dropped to `<body>`
Both agents measured `document.activeElement === BODY` after Delete AND after clicking Send (Enter-to-send
correctly keeps focus). The body is genuinely cleared in PocketBase. 3.4a and 3.4b both prescribed
"an undo, not a confirm" — third occurrence.

### [P1] The scrolling transcript is keyboard-unreachable
For a member with no messages of their own: `tabindex: null, role: null, aria-label: null,
focusableDescendants: 0`, with scrollHeight 2304 / clientHeight 338. Precisely the WCAG 2.1.1 failure 3.1
fixed on the board's scrollport.

## Persona Red Flags

- The one announcement that matters is 2331px down a 2408px page and 44% legible.
- Nobody knows when anything happened, in a surface CONTEXT.md calls "the record of draft night".
- A mis-tap deletes permanently — Delete sits inline in a `flex-wrap` paragraph, so its x-position moves
  with the message's length. 3.4b's "Remove under Up" hazard in a new form.
- VoiceOver reads `The app:The draft is complete...` — the `sr-only` label has no trailing space.
- Borderline: the collapsed header's rail-blue line measures 4.22:1 while hovered (`hover:bg-ink/5`),
  under AA. One live reading plus analytic confirmation.

## Minor Observations

`"Write something first."` is unreachable (Send disabled, `send()` early-returns). The same body renders
ink 13.92:1 in the transcript and `ink-soft` 5.77:1 in the header. The input re-implements `inputStyles`
and drops `placeholder:text-ink-faint`. The reconnect notice is a 42-char sentence in 11px caps — the
`all-caps-body` defect from two previous critiques. CONTEXT.md now defines **retract**, a word the
interface never speaks.

Verified NOT defects: no page-level horizontal overflow in any state; the ticker really is gone; scroll
anchoring is correct in both directions (top stays put, bottom stays pinned); the transcript's left rail
is pixel-consistent between system and member lines; all contrasts pass at rest.

## Questions to Consider

1. If the collapsed header is the whole justification for collapsing, why does it get 212px closed and
   282px open — less room in the state that needs it?
2. If chat replaced the ticker (D11), why did the ticker's one durable virtue — a scannable column of
   pick numbers — not come with it?
3. `messages.ts` exists because strings assembled in JSX shipped four copy defects. Why are the
   component's own five strings assembled in JSX?
4. A transcript with no timestamps: is it a record, or a feed? CONTEXT.md claims the former.
