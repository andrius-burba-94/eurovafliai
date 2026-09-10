---
name: component-reuse
description: UI reuse discipline for Eurovafliai — search existing board vocabulary and draft-room surfaces before building, the reuse > extend > compose > create-reusable ladder, where shared vs route-local components belong. Use whenever building or changing UI in src/components or src/app, adding a slot, button, list, dialog, live region, or drag interaction.
paths:
  - "src/components/**"
  - "src/app/**/*.tsx"
  - "DESIGN.md"
  - ".impeccable/design.json"
---

# Component reuse

The default failure mode is a one-off that already exists in the board's
vocabulary or a sibling route file. Visual law is `DESIGN.md` and
`.impeccable/design.json`. This skill is the **inventory and placement
rule**, not a second design system.

## Decision ladder

Work down; stop at the first step that fits. Justify a new file in the PR
or response, not in a code comment.

1. **Reuse as-is** — `Slot`, `SubmitButton`, radar, chat, board scroll already
   do the job.
2. **Extend** — add a `Slot` state, a `SubmitButton` variant, or a prop whose
   default preserves existing call sites.
3. **Compose** — confirm flow = arm on the row + confirm in the sticky band
   (`ConfirmPick`), not a new modal primitive.
4. **Create reusable** — nothing fits. Put it in `src/components/` if a second
   consumer will need it (or already does). Design the props as if they will.
5. **Route-local** — allowed for page wiring (`live-draft.tsx`, `sheet-list.tsx`).
   Generic UI (empty states, slots, primary acts, live regions, scrollports)
   does not live inline in a route file if `src/components/` already has it.

When you extract to `src/components/`, migrate existing call sites in the same
change. Do not leave two versions.

## Inventory

| Module | Role |
|---|---|
| `src/components/board.tsx` | Slot vocabulary and state language (`waiting`, `filled`, `transit`, …). Server-safe. Maps states to complete CSS rules — never interpolate class names. `EmptyNotice` is the empty-state sentence; keep `data-testid` on it so E2E parent selectors remain the Bank. |
| `src/components/draft-board.tsx` | Draft-night board using that vocabulary. |
| `src/components/board-scroll.tsx` | Scrollport: `tabIndex={0}`, `role="region"`, `aria-label`. |
| `src/components/submit-button.tsx` | The primary act. Marker-red is for the act, not for leftover state. |
| `src/components/roster-radar.tsx` | Roster filled/empty by position. Shares `src/lib/positions.ts` for copy. |
| `src/components/league-chat.tsx` | Transcript. One shared PB client. `break-words` on pasted text. |
| `src/app/leagues/[id]/draft/pick-clock.tsx` | Sticky clock band. Confirm lives here so a double-tap on a row cannot arm-and-commit. |
| `src/app/leagues/[id]/draft/confirm-pick.tsx` | Confirm control; survives the paused-band unmount so a refusal can still be explained. |
| `src/app/leagues/[id]/draft/clock-cue.tsx` | Sound/live-region cue; fires on **turn transition**, not "is it my turn". |
| `src/app/leagues/[id]/draft/armed-pick.tsx` | Armed pool row. |
| `src/app/leagues/[id]/draft/pick-form.tsx` | Pick request. |
| `src/app/leagues/[id]/sheet/sheet-list.tsx` | Hand-rolled drag (ref for drop target, nearest-midpoint hit-test). |
| `src/lib/positions.ts` | Position words and the one list-join. Do not duplicate. |

Helpers for E2E: `draftPlayer` / `submitPick` in the Playwright specs — new
pick interactions go through those, not a third copy of the tap sequence.

## Designing for reuse here

- **One rule per slot state.** Tailwind v4 emits `@utility` alphabetically;
  two `border-top` utilities on one element composite into a material that
  exists in neither. Put the whole border on the state's rule.
- **`className` maps written out**, never `` `slot-${state}` `` — interpolated
  names compile to nothing.
- **Controlled inputs** for anything a server action round-trips (React 19
  resets uncontrolled fields).
- **One polite `getByRole("status")` per unnamed live region.** A second needs
  `data-testid` and to be addressed by name.
- **Focusable overflow.** Any `overflow-y-auto` box needs `tabIndex={0}`,
  `role="region"`, `aria-label`. Add `break-words` if it can contain a paste.

## Known gotchas

- **Two `border-top` utilities do not compose** in Tailwind v4. A slot's state
  belongs in `Slot`'s `state` union, one rule per row.
- **A `sticky bottom-0` bar covers the rows it acts on** (218px on a Pixel 7).
  Reserve space below the list and scroll the acted-on row to `block: "center"`.
- **Hand-rolled drag:** drop target in a `useRef` (not React state);
  hit-test by nearest midpoint, not containment; suppress the `click` after
  `pointerup` and disarm that ref on the next macrotask; the travelling row
  must carry its material (transform on the element that has the state).
- **A confirmation on the same control it confirms is not one.** Fast
  double-tap arms and commits. Confirm lives in the sticky band.
- **A refusal must not be rendered by something the refusal destroys.**
  Render the explanation outside the paused branch of the clock band.
- **`useActionState` keeps the previous result.** Return the id of the thing
  that succeeded and compare it; `{ ok: true }` will disarm a freshly armed row.
- **Two live regions saying the same sentence is one too many.** Visible copy
  can stay; drop the duplicate `role="alert"`.
- **If the element is no longer the act, it must not keep the act's material.**
  DESIGN.md forbids two marker-red primary actions on one surface.
- **Browsers will not play a sound a user did not ask for.** Unlock
  `AudioContext` on the first `pointerdown`/`keydown`. `navigator.vibrate` is
  a no-op on iOS Safari — never promise a buzz.
- **A cue driven by "is it my turn now" fires on every re-render.** Fire on
  the transition. A preference may mute noise, never the announcement.
- **Focus after a refusal is a different path from success.** The explanation
  needs `tabIndex={-1}` as last resort when the button unmounts.
- **Re-keying a form to re-seed it throws away `useActionState`.** Adjust
  state during render against the last seeded prop when the box is untouched.
- **A scrolling region with no focusable children is keyboard-unreachable.**
- **`overflow-y-auto` makes `overflow-x` compute to `auto`.** Pasted URLs
  need `break-words`.
- **A rate limit will refuse an undo.** Restores must be exempt.
- **A live region is a channel, not a record.** Do not assert that an old
  announcement persists. Do not narrate a rebuilt row on every keystroke.
