"use client";

import { useActionState, useEffect, useRef } from "react";

import { Correction } from "@/components/board";
import { SubmitButton } from "@/components/submit-button";
import { makePick, type DraftResult } from "@/lib/drafts/actions";

import { useArmedPick } from "./armed-pick";

/**
 * The tap that actually drafts somebody — in the sticky band, not on the row.
 *
 * A tap on a pool row **arms** it; this is where the pick lands. That
 * separation is the whole mechanism rather than a layout choice: with the
 * confirm on the row's own button, **a fast double-tap arms and picks inside
 * 200ms**, so the guard would catch a stray single tap and miss the fat-finger
 * double-tap blueprint 3.7 is actually about. Here it is out of reach of that
 * gesture, at the top of the viewport where the clock already is — and it gives
 * the pointer a `Cancel` it never had, since Escape was keyboard-only.
 *
 * Renders nothing at all until something is armed, so the band keeps its shape
 * for the eleven people who are not picking.
 */

const START: DraftResult = { error: null };

export function ConfirmPick({
  leagueId,
  live,
}: {
  leagueId: string;
  /**
   * Is the draft actually running?
   *
   * The correction stays on screen whatever the draft is doing — that is the
   * whole reason this component sits outside the band's paused/on-clock branch,
   * and the two stale-tab specs found it. But the **button** must not: paused,
   * the band was 380px of a 390px phone carrying the same sentence three times
   * and a marker-red `Draft <Name>` at the centre of it, while every `Choose`
   * in the pool below had correctly withdrawn. `page.tsx` states the principle
   * in its own comment — "offering a button the server is about to refuse would
   * be worse than not offering one" — and the loudest control in the app was
   * the one breaking it.
   */
  live: boolean;
}) {
  const { armed, disarm, refuse, refused } = useArmedPick();
  const [result, action] = useActionState(makePick, START);
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);

  // A landed pick disarms; a refusal keeps the row armed so the tap can simply
  // be repeated, which is the shape 3.5's chat send uses. The refused id goes
  // back into the context so the *row* can strike itself too — 3.3's critique
  // fix, which moving the confirm here would otherwise have traded away.
  useEffect(() => {
    // **Only if this result is about the player in hand.** `useActionState`
    // keeps the last result across the next arming, so acting on `picked`
    // alone would disarm a freshly armed row the moment the effect happened to
    // re-run — the pick would silently un-choose itself. Comparing the id is
    // what makes "did *this* pick land" a decidable question.
    if (result.picked && result.playerId && result.playerId === armed?.playerId) {
      disarm();
    } else if (result.error) {
      // `playerId` is only set on refusals the pool can point at a row; a
      // refusal without one (a paused draft, a lost session) still has to be
      // said somewhere, so the band takes it either way.
      refuse({ playerId: result.playerId ?? "", reason: result.error });
    }
  }, [result, armed, disarm, refuse]);

  /**
   * Focus the confirming button as soon as it appears.
   *
   * This is what keeps the keyboard path at two keystrokes: `Enter` on a row
   * arms it, focus lands here, and `Enter` again drafts — the same two presses
   * 3.3 shipped, now through the same mechanism as a thumb rather than a second
   * one beside it. It also means a screen reader is taken to the thing it has
   * to confirm rather than left on a row that has quietly changed meaning.
   */
  useEffect(() => {
    // Through the form rather than a ref on the button: `SubmitButton` is the
    // design system's only client component and does not forward a ref, and
    // widening its API for one caller is the trade 3.4b declined to make with
    // `Slot`.
    // The button when there is one, the explanation when there is not.
    //
    // Both halves are needed and they were found in the wrong order. First the
    // effect was keyed on `armed` alone, so a refusal — which deliberately does
    // *not* disarm — never re-ran it and focus fell to `<body>`: the sixth
    // occurrence of that defect in this project, on the one path where somebody
    // has just been told no. Then adding `refused` was still not enough,
    // because a refusal caused by a **pause** correctly unmounts the button
    // (see `live`), leaving nothing to focus. So focus goes to the correction
    // itself, which is the thing that just appeared and the thing that explains
    // what happened — the same answer 3.4b reached for its tombstone.
    const go = formRef.current?.querySelector("button");
    if (go && !go.disabled) go.focus();
    else if (refused) noteRef.current?.focus();
  }, [armed, refused]);
  // `refused` is in the deps, and that omission was this slice's one outright
  // defect. Keyed on `armed` alone the effect never re-ran for a refusal — a
  // refusal deliberately does *not* disarm, so the row stays in hand — and
  // `SubmitButton` is disabled while pending, so the browser blurred it and
  // focus fell to `<body>` with a clock running. **Sixth occurrence of this
  // exact defect in this project** (3.3, 3.4a, 3.4b twice, 3.5), on the one
  // path where somebody has just been told no. `armed-pick.tsx` claims to have
  // closed it at the source; it had closed three paths out of four.

  /**
   * The refusal outlives the armed row, and that is not a detail.
   *
   * Every refusal revalidates the room (2.4's decision: "a stale tab is
   * corrected by the act of being wrong"), so a tab that submits into a draft
   * that has since been paused gets its answer *and* a re-render that flips
   * this band to its paused state. Rendering the correction only alongside an
   * armed pick therefore destroyed the explanation in the same breath as
   * producing it — the tap was refused, the room corrected itself, and the
   * member was told nothing. Found by the two stale-tab specs, which is the
   * only place a refusal and a re-render arrive together.
   */
  if (!armed && !refused) return null;

  return (
    <div className="mt-3 flex flex-col gap-2" data-testid="confirm-pick">
      {refused ? (
        // `tabIndex={-1}` so focus has somewhere deliberate to land when the
        // button it would otherwise return to is gone. Not reachable by Tab.
        <div ref={noteRef} tabIndex={-1}>
          <Correction testId="confirm-pick-error">{refused.reason}</Correction>
        </div>
      ) : null}
      {!armed || !live ? null : (
      <>
      {/* Only when it carries something the button does not.
          
          It used to print the player's name on every pick — so the band said it
          twice, once here and once on the button, in 92 and 89 characters of
          11px uppercase at 0.14em tracking. That is what took the band to 346px
          (41% of a phone) on a long name, and the in-page detector flagged both
          as `all-caps-body`. Kept for the case that earns it: a manager
          spending somebody else's turn, where "for Kaunas Kings" is the fact
          that prevents a mis-pick. Sentence case and `text-ink` rather than
          `slot-label` on `ink-soft`, which the detector also flagged as
          `gray-on-color`. */}
      {armed.forTeamName ? (
        <p className="max-w-prose text-sm" data-testid="confirm-pick-who">
          Drafting for {armed.forTeamName}.
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <form ref={formRef} action={action}>
          <input type="hidden" name="leagueId" value={leagueId} />
          <input type="hidden" name="playerId" value={armed.playerId} />
          {/* Marker, because this is the one act on the surface — and the band
              is `slot-live`, so the label is ink on the blush rather than
              marker on marker, which DESIGN.md forbids by name and 3.3 shipped
              anyway on the one control it matters most for. */}
          {/* `Draft` alone. With the name on it this was **89 characters of
              uppercase inside one button** — four wrapped lines and 92px tall
              at 390px, which also pushed `Cancel` onto a line of its own even
              at ordinary name lengths. The row that is `Chosen` names the
              player, the announcement names the player, and `ariaLabel` names
              the player; the button is the *act*. */}
          <SubmitButton
            testId="confirm-pick-go"
            tone="liveOnField"
            compact
            ariaLabel={`Draft ${armed.playerName}`}
            pendingLabel="Drafting…"
          >
            Draft
          </SubmitButton>
        </form>
        <button
          type="button"
          onClick={disarm}
          data-testid="confirm-pick-cancel"
          className="slot-label min-h-11 min-w-11 border border-ink/50 px-4 text-ink transition-colors hover:border-ink/80 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-live"
        >
          Cancel
        </button>
      </div>
      </>
      )}
    </div>
  );
}
